use crate::http::ApiError;
use aws_sdk_dynamodb::types::AttributeValue;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostStatus {
    Draft,
    Published,
}

impl PostStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            PostStatus::Draft => "draft",
            PostStatus::Published => "published",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PostInput {
    pub slug: String,
    pub title: String,
    pub category: String,
    pub date: String,
    pub content: String,
    pub status: PostStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub slug: String,
    pub title: String,
    pub category: String,
    pub date: String,
    pub content: String,
    pub status: PostStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostSummary {
    pub slug: String,
    pub title: String,
    pub category: String,
    pub date: String,
    pub status: PostStatus,
    pub created_at: String,
    pub updated_at: String,
}

impl PostStatus {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "draft" => Some(PostStatus::Draft),
            "published" => Some(PostStatus::Published),
            _ => None,
        }
    }
}

pub fn pk_of(slug: &str) -> String {
    format!("POST#{slug}")
}

/// 현재 Next.js `itemOf` 와 같은 항목. 발행 글만 gsi1 키를 가진다.
pub fn to_item(post: &Post) -> HashMap<String, AttributeValue> {
    let s = |v: &str| AttributeValue::S(v.to_string());
    let mut item = HashMap::from([
        ("pk".to_string(), s(&pk_of(&post.slug))),
        ("slug".to_string(), s(&post.slug)),
        ("title".to_string(), s(&post.title)),
        ("category".to_string(), s(&post.category)),
        ("date".to_string(), s(&post.date)),
        ("content".to_string(), s(&post.content)),
        ("status".to_string(), s(post.status.as_str())),
        ("createdAt".to_string(), s(&post.created_at)),
        ("updatedAt".to_string(), s(&post.updated_at)),
    ]);
    if post.status == PostStatus::Published {
        item.insert("gsi1pk".into(), s("PUBLISHED"));
        item.insert("gsi1sk".into(), s(&format!("{}#{}", post.date, post.slug)));
    }
    item
}

fn attr(item: &HashMap<String, AttributeValue>, key: &str) -> Result<String, ApiError> {
    item.get(key)
        .and_then(|v| v.as_s().ok())
        .cloned()
        .ok_or(ApiError::Internal)
}

fn status_attr(item: &HashMap<String, AttributeValue>) -> Result<PostStatus, ApiError> {
    PostStatus::parse(&attr(item, "status")?).ok_or(ApiError::Internal)
}

/// 저장된 항목을 읽는다. 형식이 깨진 항목은 500 으로 본다.
pub fn from_item(item: &HashMap<String, AttributeValue>) -> Result<Post, ApiError> {
    Ok(Post {
        slug: attr(item, "slug")?,
        title: attr(item, "title")?,
        category: attr(item, "category")?,
        date: attr(item, "date")?,
        content: attr(item, "content")?,
        status: status_attr(item)?,
        created_at: attr(item, "createdAt")?,
        updated_at: attr(item, "updatedAt")?,
    })
}

/// 목록용. content 가 없는 항목(GSI·projection)도 읽는다.
pub fn summary_from_item(item: &HashMap<String, AttributeValue>) -> Result<PostSummary, ApiError> {
    Ok(PostSummary {
        slug: attr(item, "slug")?,
        title: attr(item, "title")?,
        category: attr(item, "category")?,
        date: attr(item, "date")?,
        status: status_attr(item)?,
        created_at: attr(item, "createdAt")?,
        updated_at: attr(item, "updatedAt")?,
    })
}

#[cfg(test)]
pub(crate) fn sample(slug: &str, date: &str, status: PostStatus) -> Post {
    Post {
        slug: slug.into(),
        title: format!("제목 {slug}"),
        category: "cs".into(),
        date: date.into(),
        content: "본문 내용".into(),
        status,
        created_at: "2025-01-01T00:00:00.000Z".into(),
        updated_at: "2025-01-02T00:00:00.000Z".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(item: &HashMap<String, AttributeValue>, k: &str) -> Option<String> {
        item.get(k).and_then(|v| v.as_s().ok()).cloned()
    }

    #[test]
    fn published_item_has_gsi_keys() {
        let item = to_item(&sample("fixed", "2025-03-04", PostStatus::Published));
        assert_eq!(s(&item, "pk").as_deref(), Some("POST#fixed"));
        assert_eq!(s(&item, "gsi1pk").as_deref(), Some("PUBLISHED"));
        assert_eq!(s(&item, "gsi1sk").as_deref(), Some("2025-03-04#fixed"));
        assert_eq!(s(&item, "status").as_deref(), Some("published"));
        assert_eq!(
            s(&item, "createdAt").as_deref(),
            Some("2025-01-01T00:00:00.000Z")
        );
        assert_eq!(
            s(&item, "updatedAt").as_deref(),
            Some("2025-01-02T00:00:00.000Z")
        );
    }

    #[test]
    fn draft_item_has_no_gsi_keys() {
        let item = to_item(&sample("fixed", "2025-03-04", PostStatus::Draft));
        assert!(!item.contains_key("gsi1pk"));
        assert!(!item.contains_key("gsi1sk"));
        assert_eq!(s(&item, "status").as_deref(), Some("draft"));
    }

    #[test]
    fn round_trip() {
        for st in [PostStatus::Draft, PostStatus::Published] {
            let p = sample("browser-rendering", "2024-12-31", st);
            assert_eq!(from_item(&to_item(&p)).unwrap(), p);
        }
    }

    #[test]
    fn from_item_rejects_bad_items() {
        let mut item = to_item(&sample("fixed", "2025-03-04", PostStatus::Draft));
        item.insert("status".into(), AttributeValue::S("hidden".into()));
        assert!(matches!(from_item(&item), Err(ApiError::Internal)));
        let mut item = to_item(&sample("fixed", "2025-03-04", PostStatus::Draft));
        item.remove("title");
        assert!(matches!(from_item(&item), Err(ApiError::Internal)));
    }

    #[test]
    fn summary_without_content() {
        let p = sample("fixed", "2025-03-04", PostStatus::Published);
        let mut item = to_item(&p);
        item.remove("content");
        let sum = summary_from_item(&item).unwrap();
        assert_eq!(sum.slug, "fixed");
        let v = serde_json::to_value(&sum).unwrap();
        assert!(v.get("content").is_none());
        assert_eq!(v["createdAt"], "2025-01-01T00:00:00.000Z");
        assert_eq!(v["updatedAt"], "2025-01-02T00:00:00.000Z");
    }

    #[test]
    fn post_json_shape() {
        let v = serde_json::to_value(sample("fixed", "2025-03-04", PostStatus::Draft)).unwrap();
        let mut keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "category",
                "content",
                "createdAt",
                "date",
                "slug",
                "status",
                "title",
                "updatedAt"
            ]
        );
        assert_eq!(v["status"], "draft");
    }
}
