use crate::http::ApiError;
use crate::posts::model::{
    from_item, pk_of, summary_from_item, to_item, Post, PostInput, PostStatus, PostSummary,
};
use async_trait::async_trait;
use aws_sdk_dynamodb::error::{ProvideErrorMetadata, SdkError};
use aws_sdk_dynamodb::types::{AttributeValue, ReturnValue};
use std::collections::HashMap;

#[async_trait]
pub trait PostStore: Send + Sync {
    /// 발행 글, 날짜(gsi1sk) 내림차순.
    async fn list_published(&self) -> Result<Vec<PostSummary>, ApiError>;
    /// 초안 포함 전체, date 내림차순(같으면 slug 내림차순).
    async fn list_all(&self) -> Result<Vec<PostSummary>, ApiError>;
    async fn get(&self, slug: &str) -> Result<Option<Post>, ApiError>;
    /// 같은 slug 가 있으면 `ApiError::Conflict`.
    async fn create(&self, post: &Post) -> Result<(), ApiError>;
    /// `slug` 가 키다. `input.slug` 는 쓰지 않는다. 없으면 `ApiError::NotFound`.
    async fn update(
        &self,
        slug: &str,
        input: &PostInput,
        updated_at: &str,
    ) -> Result<Post, ApiError>;
    /// 없어도 성공.
    async fn delete(&self, slug: &str) -> Result<(), ApiError>;
}

/// UpdateItem 의 식과 이름·값 맵.
#[derive(Debug, PartialEq)]
pub struct UpdateParts {
    pub expression: String,
    pub names: HashMap<String, String>,
    pub values: HashMap<String, AttributeValue>,
}

/// 현재 Next.js `updatePost` 와 같은 UpdateExpression. `createdAt`·`slug`·`pk` 는 건드리지 않는다.
/// 발행이면 gsi1 키를 SET, 초안이면 REMOVE 해서 공개 목록에서 뺀다.
pub fn update_parts(slug: &str, input: &PostInput, updated_at: &str) -> UpdateParts {
    let s = |v: &str| AttributeValue::S(v.to_string());
    let fields = [
        ("title", input.title.as_str()),
        ("category", input.category.as_str()),
        ("date", input.date.as_str()),
        ("content", input.content.as_str()),
        ("status", input.status.as_str()),
        ("updatedAt", updated_at),
    ];
    let mut sets = Vec::new();
    let mut names = HashMap::new();
    let mut values = HashMap::new();
    for (attr, value) in fields {
        sets.push(format!("#{attr} = :{attr}"));
        names.insert(format!("#{attr}"), attr.to_string());
        values.insert(format!(":{attr}"), s(value));
    }
    let published = input.status == PostStatus::Published;
    if published {
        sets.push("gsi1pk = :gsi1pk".into());
        sets.push("gsi1sk = :gsi1sk".into());
        values.insert(":gsi1pk".into(), s("PUBLISHED"));
        values.insert(":gsi1sk".into(), s(&format!("{}#{slug}", input.date)));
    }
    let mut expression = format!("SET {}", sets.join(", "));
    if !published {
        expression.push_str(" REMOVE gsi1pk, gsi1sk");
    }
    UpdateParts {
        expression,
        names,
        values,
    }
}

const SUMMARY_ATTRS: [&str; 7] = [
    "slug",
    "title",
    "category",
    "date",
    "status",
    "createdAt",
    "updatedAt",
];

/// Scan 에서 content 를 뺀 projection.
pub fn list_all_projection() -> (String, HashMap<String, String>) {
    let names: HashMap<String, String> = SUMMARY_ATTRS
        .iter()
        .map(|a| (format!("#{a}"), a.to_string()))
        .collect();
    let expr = SUMMARY_ATTRS
        .iter()
        .map(|a| format!("#{a}"))
        .collect::<Vec<_>>()
        .join(", ");
    (expr, names)
}

/// date 내림차순, 같으면 slug 내림차순(현재 `listAllPosts` 와 같음).
pub fn sort_summaries(list: &mut [PostSummary]) {
    list.sort_by(|a, b| b.date.cmp(&a.date).then_with(|| b.slug.cmp(&a.slug)));
}

pub struct DynamoStore {
    pub client: aws_sdk_dynamodb::Client,
    pub table: String,
}

/// 오류 코드(서비스 오류) 또는 오류 종류(그 외)만 돌려준다. 메시지·요청·응답·헤더는 쓰지 않는다.
fn error_tag<E, R>(err: &SdkError<E, R>) -> &str
where
    E: ProvideErrorMetadata,
{
    match err {
        SdkError::ServiceError(s) => s.err().code().unwrap_or("none"),
        SdkError::DispatchFailure(_) => "dispatch",
        SdkError::TimeoutError(_) => "timeout",
        SdkError::ResponseError(_) => "response",
        SdkError::ConstructionFailure(_) => "construction",
        _ => "other",
    }
}

/// SDK 오류를 500 으로 바꾸며 한 줄만 남긴다: 오류 코드/종류 only(Ruling R2).
fn internal<E, R>(err: SdkError<E, R>) -> ApiError
where
    E: ProvideErrorMetadata,
{
    tracing::error!(dynamodb_error = error_tag(&err), "dynamodb call failed");
    ApiError::Internal
}

fn is_condition_failure<E, R>(err: &SdkError<E, R>) -> bool
where
    E: ProvideErrorMetadata,
{
    err.as_service_error().and_then(|e| e.code()) == Some("ConditionalCheckFailedException")
}

#[async_trait]
impl PostStore for DynamoStore {
    async fn list_published(&self) -> Result<Vec<PostSummary>, ApiError> {
        let mut out = Vec::new();
        let mut start = None;
        loop {
            let res = self
                .client
                .query()
                .table_name(&self.table)
                .index_name("gsi1")
                .key_condition_expression("gsi1pk = :p")
                .expression_attribute_values(":p", AttributeValue::S("PUBLISHED".into()))
                .scan_index_forward(false)
                .set_exclusive_start_key(start)
                .send()
                .await
                .map_err(internal)?;
            for item in res.items() {
                out.push(summary_from_item(item)?);
            }
            start = res.last_evaluated_key;
            if start.is_none() {
                break;
            }
        }
        Ok(out)
    }

    async fn list_all(&self) -> Result<Vec<PostSummary>, ApiError> {
        let (projection, names) = list_all_projection();
        let mut out = Vec::new();
        let mut start = None;
        loop {
            let res = self
                .client
                .scan()
                .table_name(&self.table)
                .projection_expression(&projection)
                .set_expression_attribute_names(Some(names.clone()))
                .set_exclusive_start_key(start)
                .send()
                .await
                .map_err(internal)?;
            for item in res.items() {
                out.push(summary_from_item(item)?);
            }
            start = res.last_evaluated_key;
            if start.is_none() {
                break;
            }
        }
        sort_summaries(&mut out);
        Ok(out)
    }

    async fn get(&self, slug: &str) -> Result<Option<Post>, ApiError> {
        let res = self
            .client
            .get_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S(pk_of(slug)))
            .send()
            .await
            .map_err(internal)?;
        res.item.as_ref().map(from_item).transpose()
    }

    async fn create(&self, post: &Post) -> Result<(), ApiError> {
        self.client
            .put_item()
            .table_name(&self.table)
            .set_item(Some(to_item(post)))
            .condition_expression("attribute_not_exists(pk)")
            .send()
            .await
            .map_err(|e| {
                if is_condition_failure(&e) {
                    ApiError::Conflict
                } else {
                    internal(e)
                }
            })?;
        Ok(())
    }

    async fn update(
        &self,
        slug: &str,
        input: &PostInput,
        updated_at: &str,
    ) -> Result<Post, ApiError> {
        let parts = update_parts(slug, input, updated_at);
        let res = self
            .client
            .update_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S(pk_of(slug)))
            .update_expression(parts.expression)
            .condition_expression("attribute_exists(pk)")
            .set_expression_attribute_names(Some(parts.names))
            .set_expression_attribute_values(Some(parts.values))
            .return_values(ReturnValue::AllNew)
            .send()
            .await
            .map_err(|e| {
                if is_condition_failure(&e) {
                    ApiError::NotFound
                } else {
                    internal(e)
                }
            })?;
        from_item(res.attributes.as_ref().ok_or(ApiError::Internal)?)
    }

    async fn delete(&self, slug: &str) -> Result<(), ApiError> {
        self.client
            .delete_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S(pk_of(slug)))
            .send()
            .await
            .map_err(internal)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(status: PostStatus) -> PostInput {
        PostInput {
            slug: "ignored-body-slug".into(),
            title: "t".into(),
            category: "c".into(),
            date: "2025-03-04".into(),
            content: "x".into(),
            status,
        }
    }

    fn sv(parts: &UpdateParts, k: &str) -> Option<String> {
        parts.values.get(k).and_then(|v| v.as_s().ok()).cloned()
    }

    #[test]
    fn update_published_sets_gsi_keys() {
        let p = update_parts(
            "fixed",
            &input(PostStatus::Published),
            "2025-05-05T00:00:00.000Z",
        );
        assert_eq!(
            p.expression,
            "SET #title = :title, #category = :category, #date = :date, #content = :content, \
             #status = :status, #updatedAt = :updatedAt, gsi1pk = :gsi1pk, gsi1sk = :gsi1sk"
        );
        assert_eq!(sv(&p, ":gsi1pk").as_deref(), Some("PUBLISHED"));
        assert_eq!(sv(&p, ":gsi1sk").as_deref(), Some("2025-03-04#fixed"));
        assert_eq!(sv(&p, ":status").as_deref(), Some("published"));
        assert_eq!(
            sv(&p, ":updatedAt").as_deref(),
            Some("2025-05-05T00:00:00.000Z")
        );
    }

    #[test]
    fn update_draft_removes_gsi_keys() {
        let p = update_parts("fixed", &input(PostStatus::Draft), "now");
        assert!(p.expression.ends_with(" REMOVE gsi1pk, gsi1sk"));
        assert!(!p.values.contains_key(":gsi1pk"));
        assert!(!p.values.contains_key(":gsi1sk"));
        assert_eq!(sv(&p, ":status").as_deref(), Some("draft"));
    }

    #[test]
    fn update_never_touches_created_at_or_slug() {
        for st in [PostStatus::Draft, PostStatus::Published] {
            let p = update_parts("fixed", &input(st), "now");
            assert!(!p.expression.contains("createdAt"));
            assert!(!p.expression.contains("slug"));
            assert!(!p.names.values().any(|n| n == "createdAt" || n == "slug"));
            assert!(!p
                .values
                .values()
                .any(|v| v.as_s().map(|s| s.contains("ignored")).unwrap_or(false)));
            // 식에 쓰인 이름·값만 맵에 있다(DynamoDB 는 안 쓰인 값이 있으면 거부).
            for k in p.names.keys().chain(p.values.keys()) {
                assert!(p.expression.contains(k.as_str()), "{k}");
            }
        }
    }

    #[test]
    fn projection_excludes_content() {
        let (expr, names) = list_all_projection();
        let mut attrs: Vec<_> = names.values().cloned().collect();
        attrs.sort();
        assert_eq!(
            attrs,
            [
                "category",
                "createdAt",
                "date",
                "slug",
                "status",
                "title",
                "updatedAt"
            ]
        );
        for k in names.keys() {
            assert!(expr.contains(k.as_str()));
        }
        assert!(!expr.contains("content"));
    }

    #[test]
    fn sorts_by_date_then_slug_desc() {
        let mk = |slug: &str, date: &str| PostSummary {
            slug: slug.into(),
            title: String::new(),
            category: String::new(),
            date: date.into(),
            status: PostStatus::Draft,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let mut v = vec![
            mk("a", "2024-01-01"),
            mk("b", "2025-01-01"),
            mk("c", "2024-01-01"),
        ];
        sort_summaries(&mut v);
        let order: Vec<_> = v.iter().map(|s| s.slug.as_str()).collect();
        assert_eq!(order, ["b", "c", "a"]);
    }
}

#[cfg(test)]
pub use mem::MemStore;

#[cfg(test)]
mod mem {
    use super::*;
    use std::sync::Mutex;

    /// DynamoDB 항목(to_item 결과)을 그대로 들고 있는 테스트용 저장소.
    #[derive(Default)]
    pub struct MemStore {
        pub items: Mutex<HashMap<String, HashMap<String, AttributeValue>>>,
    }

    impl MemStore {
        pub fn with(posts: &[Post]) -> Self {
            let store = MemStore::default();
            {
                let mut items = store.items.lock().unwrap();
                for p in posts {
                    items.insert(pk_of(&p.slug), to_item(p));
                }
            }
            store
        }
    }

    fn s(item: &HashMap<String, AttributeValue>, k: &str) -> String {
        item.get(k)
            .and_then(|v| v.as_s().ok())
            .cloned()
            .unwrap_or_default()
    }

    #[async_trait]
    impl PostStore for MemStore {
        async fn list_published(&self) -> Result<Vec<PostSummary>, ApiError> {
            let items = self.items.lock().unwrap();
            let mut hits: Vec<_> = items
                .values()
                .filter(|i| s(i, "gsi1pk") == "PUBLISHED")
                .collect();
            hits.sort_by_key(|i| std::cmp::Reverse(s(i, "gsi1sk")));
            hits.into_iter().map(summary_from_item).collect()
        }

        async fn list_all(&self) -> Result<Vec<PostSummary>, ApiError> {
            let items = self.items.lock().unwrap();
            let mut out = items
                .values()
                .map(summary_from_item)
                .collect::<Result<Vec<_>, _>>()?;
            sort_summaries(&mut out);
            Ok(out)
        }

        async fn get(&self, slug: &str) -> Result<Option<Post>, ApiError> {
            let items = self.items.lock().unwrap();
            items.get(&pk_of(slug)).map(from_item).transpose()
        }

        async fn create(&self, post: &Post) -> Result<(), ApiError> {
            let mut items = self.items.lock().unwrap();
            let pk = pk_of(&post.slug);
            if items.contains_key(&pk) {
                return Err(ApiError::Conflict);
            }
            items.insert(pk, to_item(post));
            Ok(())
        }

        async fn update(
            &self,
            slug: &str,
            input: &PostInput,
            updated_at: &str,
        ) -> Result<Post, ApiError> {
            let mut items = self.items.lock().unwrap();
            let pk = pk_of(slug);
            let old = from_item(items.get(&pk).ok_or(ApiError::NotFound)?)?;
            let post = Post {
                slug: old.slug,
                title: input.title.clone(),
                category: input.category.clone(),
                date: input.date.clone(),
                content: input.content.clone(),
                status: input.status,
                created_at: old.created_at,
                updated_at: updated_at.to_string(),
            };
            items.insert(pk, to_item(&post));
            Ok(post)
        }

        async fn delete(&self, slug: &str) -> Result<(), ApiError> {
            self.items.lock().unwrap().remove(&pk_of(slug));
            Ok(())
        }
    }
}
