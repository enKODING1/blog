use crate::http::{json, ApiError};
use crate::posts::model::{Post, PostStatus};
use crate::posts::store::PostStore;
use crate::posts::validate::{is_valid_slug, slug_error, validate};
use crate::router::Route;
use lambda_http::{Body, Response};
use serde_json::Value;
use std::collections::BTreeMap;

/// 본문을 JSON 으로 읽는다. 비었거나 깨졌으면 Null(검증에서 `_` 오류가 된다).
fn parse_body(body: &[u8]) -> Value {
    serde_json::from_slice(body).unwrap_or(Value::Null)
}

fn no_content() -> Response<Body> {
    Response::builder()
        .status(204)
        .body(Body::Empty)
        .expect("valid response")
}

/// 경로 slug 가 형식에 맞지 않으면 조회는 404(어떤 글도 그 주소를 가질 수 없다).
fn path_slug_or_404(slug: &str) -> Result<&str, ApiError> {
    if is_valid_slug(slug) {
        Ok(slug)
    } else {
        Err(ApiError::NotFound)
    }
}

/// 쓰기 경로에서 slug 형식 오류는 400 `{ errors: { slug } }`.
fn path_slug_or_400(slug: &str) -> Result<&str, ApiError> {
    match slug_error(slug) {
        None => Ok(slug),
        Some(msg) => Err(ApiError::BadRequest(BTreeMap::from([(
            "slug".to_string(),
            msg,
        )]))),
    }
}

/// 글 경로를 처리한다. 관리자 인증은 호출하는 쪽(dispatch)이 먼저 끝낸다.
pub async fn handle_posts(
    route: &Route,
    body: &[u8],
    store: &dyn PostStore,
    now: &str,
) -> Result<Response<Body>, ApiError> {
    match route {
        Route::ListPublished => Ok(json(200, &store.list_published().await?)),
        Route::AdminList => Ok(json(200, &store.list_all().await?)),
        Route::GetPublished(slug) => {
            let post = store.get(path_slug_or_404(slug)?).await?;
            match post {
                Some(p) if p.status == PostStatus::Published => Ok(json(200, &p)),
                _ => Err(ApiError::NotFound),
            }
        }
        Route::AdminGet(slug) => {
            let post = store.get(path_slug_or_404(slug)?).await?;
            post.map(|p| json(200, &p)).ok_or(ApiError::NotFound)
        }
        Route::AdminCreate => {
            let input = validate(&parse_body(body)).map_err(ApiError::BadRequest)?;
            let post = Post {
                slug: input.slug,
                title: input.title,
                category: input.category,
                date: input.date,
                content: input.content,
                status: input.status,
                created_at: now.to_string(),
                updated_at: now.to_string(),
            };
            store.create(&post).await?;
            Ok(json(201, &post))
        }
        Route::AdminUpdate(slug) => {
            let slug = path_slug_or_400(slug)?;
            // 경로 slug 가 이긴다: 본문 slug 는 덮어써서 무시하고, 없어도 검증을 통과한다.
            let mut raw = parse_body(body);
            if let Value::Object(map) = &mut raw {
                map.insert("slug".into(), Value::String(slug.to_string()));
            }
            let input = validate(&raw).map_err(ApiError::BadRequest)?;
            let post = store.update(slug, &input, now).await?;
            Ok(json(200, &post))
        }
        Route::AdminDelete(slug) => {
            store.delete(path_slug_or_400(slug)?).await?;
            Ok(no_content())
        }
        Route::AdminUpload | Route::NotFound => Err(ApiError::NotFound),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::posts::model::{pk_of, sample, PostStatus};
    use crate::posts::store::MemStore;
    use serde_json::{json, Value};

    const NOW: &str = "2026-11-28T01:02:03.456Z";

    async fn call(store: &MemStore, route: Route, body: Value) -> (u16, Value) {
        let bytes = if body.is_null() {
            Vec::new()
        } else {
            serde_json::to_vec(&body).unwrap()
        };
        let res = handle_posts(&route, &bytes, store, NOW)
            .await
            .unwrap_or_else(Into::into);
        let status = res.status().as_u16();
        let text = match res.body() {
            Body::Text(t) => t.clone(),
            Body::Binary(b) => String::from_utf8(b.clone()).unwrap(),
            Body::Empty => String::new(),
        };
        assert!(!text.contains("\"pk\""), "{text}");
        assert!(!text.contains("gsi1"), "{text}");
        let v = if text.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).unwrap()
        };
        (status, v)
    }

    fn input(slug: &str, title: &str, status: &str) -> Value {
        json!({
            "slug": slug,
            "title": title,
            "category": "cs",
            "date": "2025-06-01",
            "content": "본문",
            "status": status
        })
    }

    fn seeded() -> MemStore {
        MemStore::with(&[
            sample("old", "2024-01-01", PostStatus::Published),
            sample("draft-one", "2026-01-01", PostStatus::Draft),
            sample("new", "2025-05-05", PostStatus::Published),
            sample("mid", "2024-06-01", PostStatus::Published),
        ])
    }

    fn slugs(v: &Value) -> Vec<String> {
        v.as_array()
            .unwrap()
            .iter()
            .map(|p| p["slug"].as_str().unwrap().to_string())
            .collect()
    }

    #[tokio::test]
    async fn list_published_excludes_drafts_newest_first() {
        let store = seeded();
        let (st, v) = call(&store, Route::ListPublished, Value::Null).await;
        assert_eq!(st, 200);
        assert_eq!(slugs(&v), ["new", "mid", "old"]);
        assert!(v[0].get("content").is_none());
        assert_eq!(v[0]["createdAt"], "2025-01-01T00:00:00.000Z");
    }

    #[tokio::test]
    async fn admin_list_includes_drafts() {
        let store = seeded();
        let (st, v) = call(&store, Route::AdminList, Value::Null).await;
        assert_eq!(st, 200);
        assert_eq!(slugs(&v), ["draft-one", "new", "mid", "old"]);
        assert!(v[0].get("content").is_none());
    }

    #[tokio::test]
    async fn get_published() {
        let store = seeded();
        let (st, v) = call(&store, Route::GetPublished("new".into()), Value::Null).await;
        assert_eq!(st, 200);
        assert_eq!(v["slug"], "new");
        assert_eq!(v["content"], "본문 내용");
        assert_eq!(v["updatedAt"], "2025-01-02T00:00:00.000Z");
    }

    #[tokio::test]
    async fn draft_is_hidden_from_public_get() {
        let store = seeded();
        let (st, v) = call(&store, Route::GetPublished("draft-one".into()), Value::Null).await;
        assert_eq!((st, v), (404, json!({ "error": "not_found" })));
        let (st, v) = call(&store, Route::AdminGet("draft-one".into()), Value::Null).await;
        assert_eq!(st, 200);
        assert_eq!(v["status"], "draft");
    }

    #[tokio::test]
    async fn missing_or_invalid_slug_get_is_404() {
        let store = seeded();
        for slug in ["nope", "Hello", "%ED%95%9C", "..", "a--b"] {
            let (st, _) = call(&store, Route::GetPublished(slug.into()), Value::Null).await;
            assert_eq!(st, 404, "{slug}");
            let (st, _) = call(&store, Route::AdminGet(slug.into()), Value::Null).await;
            assert_eq!(st, 404, "{slug}");
        }
    }

    #[tokio::test]
    async fn create_then_conflict() {
        let store = MemStore::default();
        let (st, v) = call(
            &store,
            Route::AdminCreate,
            input("hello", "첫 글", "published"),
        )
        .await;
        assert_eq!(st, 201);
        assert_eq!(v["slug"], "hello");
        assert_eq!(v["createdAt"], NOW);
        assert_eq!(v["updatedAt"], NOW);
        let (st, v) = call(&store, Route::AdminCreate, input("hello", "둘째", "draft")).await;
        assert_eq!(st, 409);
        assert_eq!(v, json!({ "errors": { "slug": "이미 있는 주소입니다" } }));
        let (_, v) = call(&store, Route::AdminGet("hello".into()), Value::Null).await;
        assert_eq!(v["title"], "첫 글");
    }

    #[tokio::test]
    async fn create_invalid_is_400() {
        let store = MemStore::default();
        let (st, v) = call(&store, Route::AdminCreate, input("Bad", "", "draft")).await;
        assert_eq!(st, 400);
        assert_eq!(
            v["errors"]["slug"],
            "slug는 소문자, 숫자, 하이픈만 사용할 수 있습니다."
        );
        assert_eq!(v["errors"]["title"], "제목을 입력하세요.");
        assert!(store.items.lock().unwrap().is_empty());

        let res = handle_posts(&Route::AdminCreate, b"{not json", &store, NOW).await;
        let res: Response<Body> = res.unwrap_or_else(Into::into);
        assert_eq!(res.status().as_u16(), 400);
        assert!(store.items.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn update_uses_path_slug_not_body_slug() {
        let store = MemStore::with(&[sample("a", "2024-01-01", PostStatus::Published)]);
        let (st, v) = call(
            &store,
            Route::AdminUpdate("a".into()),
            input("b", "바뀐 제목", "published"),
        )
        .await;
        assert_eq!(st, 200);
        assert_eq!(v["slug"], "a");
        assert_eq!(v["title"], "바뀐 제목");
        assert_eq!(v["createdAt"], "2025-01-01T00:00:00.000Z");
        assert_eq!(v["updatedAt"], NOW);
        let items = store.items.lock().unwrap();
        assert_eq!(items.len(), 1);
        assert!(items.contains_key(&pk_of("a")));
        assert!(!items.contains_key(&pk_of("b")));
    }

    #[tokio::test]
    async fn update_without_body_slug_passes() {
        let store = MemStore::with(&[sample("a", "2024-01-01", PostStatus::Published)]);
        let mut body = input("x", "t", "draft");
        body.as_object_mut().unwrap().remove("slug");
        let (st, v) = call(&store, Route::AdminUpdate("a".into()), body).await;
        assert_eq!(st, 200);
        assert_eq!(v["slug"], "a");
        assert_eq!(v["status"], "draft");
        // 초안이 되면 공개 목록에서 빠진다.
        let (_, v) = call(&store, Route::ListPublished, Value::Null).await;
        assert_eq!(v, json!([]));
    }

    #[tokio::test]
    async fn update_missing_is_404() {
        let store = MemStore::default();
        let (st, v) = call(
            &store,
            Route::AdminUpdate("ghost".into()),
            input("ghost", "t", "draft"),
        )
        .await;
        assert_eq!((st, v), (404, json!({ "error": "not_found" })));
        assert!(store.items.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn update_invalid_is_400() {
        let store = MemStore::with(&[sample("a", "2024-01-01", PostStatus::Published)]);
        let mut body = input("a", "t", "draft");
        body["date"] = json!("2025-02-30");
        let (st, v) = call(&store, Route::AdminUpdate("a".into()), body).await;
        assert_eq!(st, 400);
        assert_eq!(v["errors"]["date"], "날짜는 YYYY-MM-DD 형식이어야 합니다.");
        let (st, _) = call(
            &store,
            Route::AdminUpdate("Bad".into()),
            input("a", "t", "draft"),
        )
        .await;
        assert_eq!(st, 400);
    }

    #[tokio::test]
    async fn delete_is_204_even_if_missing() {
        let store = seeded();
        let (st, v) = call(&store, Route::AdminDelete("ghost".into()), Value::Null).await;
        assert_eq!((st, v), (204, Value::Null));
        let (st, _) = call(&store, Route::AdminDelete("new".into()), Value::Null).await;
        assert_eq!(st, 204);
        assert!(!store.items.lock().unwrap().contains_key(&pk_of("new")));
    }

    #[tokio::test]
    async fn non_post_routes_are_404() {
        let store = seeded();
        for r in [Route::NotFound, Route::AdminUpload] {
            let (st, _) = call(&store, r, Value::Null).await;
            assert_eq!(st, 404);
        }
    }
}
