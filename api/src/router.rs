use crate::auth::{AuthError, TokenVerifier};
use crate::http::ApiError;
use crate::posts::handlers::handle_posts;
use crate::posts::store::PostStore;
use crate::uploads::handle_upload;
use lambda_http::http::{HeaderMap, Method};
use lambda_http::{Body, Response};
use uuid::Uuid;

#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    ListPublished,
    GetPublished(String),
    AdminList,
    AdminGet(String),
    AdminCreate,
    AdminUpdate(String),
    AdminDelete(String),
    AdminUpload,
    NotFound,
}

impl Route {
    pub fn requires_admin(&self) -> bool {
        matches!(
            self,
            Route::AdminList
                | Route::AdminGet(_)
                | Route::AdminCreate
                | Route::AdminUpdate(_)
                | Route::AdminDelete(_)
                | Route::AdminUpload
        )
    }
}

pub fn route(method: &Method, path: &str) -> Route {
    let trimmed = path.strip_suffix('/').unwrap_or(path);
    let segments: Vec<&str> = trimmed.split('/').collect();
    if segments.first() != Some(&"") {
        return Route::NotFound;
    }
    let segs = &segments[1..];
    if segs.iter().any(|s| s.is_empty()) {
        return Route::NotFound;
    }
    match (method, segs) {
        (&Method::GET, ["posts"]) => Route::ListPublished,
        (&Method::GET, ["posts", slug]) => Route::GetPublished((*slug).to_string()),
        (&Method::GET, ["admin", "posts"]) => Route::AdminList,
        (&Method::GET, ["admin", "posts", slug]) => Route::AdminGet((*slug).to_string()),
        (&Method::POST, ["admin", "posts"]) => Route::AdminCreate,
        (&Method::PUT, ["admin", "posts", slug]) => Route::AdminUpdate((*slug).to_string()),
        (&Method::DELETE, ["admin", "posts", slug]) => Route::AdminDelete((*slug).to_string()),
        (&Method::POST, ["admin", "uploads"]) => Route::AdminUpload,
        _ => Route::NotFound,
    }
}

/// 핸들러가 쓰는 의존성.
pub struct Deps<'a> {
    pub store: &'a dyn PostStore,
    pub verifier: &'a dyn TokenVerifier,
    pub s3: &'a aws_sdk_s3::Client,
    pub bucket: &'a str,
}

/// `X-User-Token` 헤더 값(이름은 대소문자 무시). 비었거나 문자열이 아니면 없음.
pub fn user_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-user-token")
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty())
}

/// 관리자 경로면 토큰을 검증한다. 통과해야 핸들러(DB·S3)에 닿는다.
async fn authorize(
    route: &Route,
    token: Option<&str>,
    verifier: &dyn TokenVerifier,
) -> Result<(), ApiError> {
    if !route.requires_admin() {
        return Ok(());
    }
    let token = token.ok_or(ApiError::Unauthorized)?;
    match verifier.verify(token).await {
        Ok(_) => Ok(()),
        Err(AuthError::Invalid) => Err(ApiError::Unauthorized),
        Err(AuthError::NotAdmin) => Err(ApiError::Forbidden),
        Err(AuthError::Unavailable) => Err(ApiError::Internal),
    }
}

/// 라우트를 처리하고 오류를 상태 코드 응답으로 바꾼다.
pub async fn dispatch(
    route: &Route,
    token: Option<&str>,
    body: &[u8],
    deps: &Deps<'_>,
    now: &str,
) -> Response<Body> {
    if let Err(err) = authorize(route, token, deps.verifier).await {
        return err.into();
    }
    let result = match route {
        Route::AdminUpload => handle_upload(body, deps.s3, deps.bucket, &Uuid::new_v4()).await,
        _ => handle_posts(route, body, deps.store, now).await,
    };
    result.unwrap_or_else(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> String {
        v.to_string()
    }

    #[test]
    fn routes() {
        assert_eq!(route(&Method::GET, "/posts"), Route::ListPublished);
        assert_eq!(route(&Method::GET, "/posts/"), Route::ListPublished);
        assert_eq!(
            route(&Method::GET, "/posts/a-b"),
            Route::GetPublished(s("a-b"))
        );
        assert_eq!(route(&Method::GET, "/posts/a/b"), Route::NotFound);
        assert_eq!(route(&Method::POST, "/posts"), Route::NotFound);
        assert_eq!(route(&Method::GET, "/admin/posts"), Route::AdminList);
        assert_eq!(
            route(&Method::GET, "/admin/posts/x"),
            Route::AdminGet(s("x"))
        );
        assert_eq!(route(&Method::POST, "/admin/posts"), Route::AdminCreate);
        assert_eq!(
            route(&Method::PUT, "/admin/posts/x"),
            Route::AdminUpdate(s("x"))
        );
        assert_eq!(
            route(&Method::DELETE, "/admin/posts/x"),
            Route::AdminDelete(s("x"))
        );
        assert_eq!(route(&Method::POST, "/admin/uploads"), Route::AdminUpload);
        assert_eq!(route(&Method::GET, "/"), Route::NotFound);
        assert_eq!(route(&Method::GET, "/nope"), Route::NotFound);
        assert_eq!(route(&Method::GET, "/posts//"), Route::NotFound);
    }

    #[test]
    fn admin_flag() {
        assert!(Route::AdminList.requires_admin());
        assert!(Route::AdminUpload.requires_admin());
        assert!(Route::AdminDelete(s("x")).requires_admin());
        assert!(!Route::ListPublished.requires_admin());
        assert!(!Route::GetPublished(s("x")).requires_admin());
        assert!(!Route::NotFound.requires_admin());
    }

    use crate::auth::{AuthError, Claims, TokenVerifier};
    use crate::posts::model::{pk_of, sample, PostStatus};
    use crate::posts::store::MemStore;
    use crate::uploads::tests::test_client;
    use async_trait::async_trait;
    use lambda_http::http::{HeaderName, HeaderValue};
    use serde_json::{json as j, Value};
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// 토큰 문자열로 결과를 정하는 가짜 verifier. 호출 횟수를 센다.
    #[derive(Default)]
    struct FakeVerifier {
        calls: AtomicUsize,
    }

    #[async_trait]
    impl TokenVerifier for FakeVerifier {
        async fn verify(&self, token: &str) -> Result<Claims, AuthError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            match token {
                "admin" => Ok(Claims {
                    sub: "u".into(),
                    email: None,
                    groups: vec!["blog-admin".into()],
                }),
                "reader" => Err(AuthError::NotAdmin),
                "down" => Err(AuthError::Unavailable),
                _ => Err(AuthError::Invalid),
            }
        }
    }

    const NOW: &str = "2026-11-28T00:00:00.000Z";

    fn post_body(slug: &str) -> Vec<u8> {
        serde_json::to_vec(&j!({
            "slug": slug, "title": "t", "category": "c",
            "date": "2025-01-01", "content": "x", "status": "published"
        }))
        .unwrap()
    }

    async fn run(
        store: &MemStore,
        verifier: &FakeVerifier,
        route: Route,
        token: Option<&str>,
        body: &[u8],
    ) -> (u16, Value) {
        let s3 = test_client();
        let deps = Deps {
            store,
            verifier,
            s3: &s3,
            bucket: "blog-media",
        };
        let res = dispatch(&route, token, body, &deps, NOW).await;
        let v = match res.body() {
            Body::Text(t) => serde_json::from_str(t).unwrap(),
            _ => Value::Null,
        };
        (res.status().as_u16(), v)
    }

    fn admin_routes() -> Vec<Route> {
        vec![
            Route::AdminList,
            Route::AdminGet(s("a")),
            Route::AdminCreate,
            Route::AdminUpdate(s("a")),
            Route::AdminDelete(s("a")),
            Route::AdminUpload,
        ]
    }

    fn seeded() -> MemStore {
        MemStore::with(&[sample("a", "2024-01-01", PostStatus::Published)])
    }

    fn snapshot(store: &MemStore) -> String {
        format!("{:?}", store.items.lock().unwrap())
    }

    #[tokio::test]
    async fn create_without_token_is_401_and_store_untouched() {
        let store = MemStore::default();
        let v = FakeVerifier::default();
        let (st, body) = run(&store, &v, Route::AdminCreate, None, &post_body("new")).await;
        assert_eq!((st, body), (401, j!({ "error": "unauthorized" })));
        assert!(store.items.lock().unwrap().is_empty());
        assert_eq!(v.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn invalid_token_is_401_not_admin_is_403_outage_is_500() {
        for (token, status) in [("forged", 401), ("", 401), ("reader", 403), ("down", 500)] {
            let store = MemStore::default();
            let v = FakeVerifier::default();
            let (st, _) = run(
                &store,
                &v,
                Route::AdminCreate,
                Some(token),
                &post_body("new"),
            )
            .await;
            assert_eq!(st, status, "{token}");
            assert!(store.items.lock().unwrap().is_empty(), "{token}");
        }
        let store = MemStore::default();
        let (_, body) = run(
            &store,
            &FakeVerifier::default(),
            Route::AdminCreate,
            Some("reader"),
            &post_body("new"),
        )
        .await;
        assert_eq!(body, j!({ "error": "forbidden" }));
    }

    #[tokio::test]
    async fn every_admin_route_is_guarded() {
        for token in [None, Some("forged"), Some("reader")] {
            for route in admin_routes() {
                let store = seeded();
                let before = snapshot(&store);
                let label = format!("{route:?} {token:?}");
                let (st, _) = run(
                    &store,
                    &FakeVerifier::default(),
                    route,
                    token,
                    &post_body("a"),
                )
                .await;
                let want = if token == Some("reader") { 403 } else { 401 };
                assert_eq!(st, want, "{label}");
                assert_eq!(snapshot(&store), before, "{label}");
            }
        }
    }

    #[tokio::test]
    async fn admin_token_reaches_handlers() {
        let store = MemStore::default();
        let v = FakeVerifier::default();
        let (st, _) = run(
            &store,
            &v,
            Route::AdminCreate,
            Some("admin"),
            &post_body("new"),
        )
        .await;
        assert_eq!(st, 201);
        assert!(store.items.lock().unwrap().contains_key(&pk_of("new")));
        let (st, _) = run(&store, &v, Route::AdminDelete(s("new")), Some("admin"), b"").await;
        assert_eq!(st, 204);
        assert!(store.items.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn admin_upload_returns_presigned_url() {
        let store = MemStore::default();
        let body = serde_json::to_vec(&j!({
            "slug": "fixed", "contentType": "image/png", "size": 10
        }))
        .unwrap();
        let v = FakeVerifier::default();
        let (st, res) = run(&store, &v, Route::AdminUpload, Some("admin"), &body).await;
        assert_eq!(st, 200);
        let path = res["markdownPath"].as_str().unwrap();
        assert!(path.starts_with("/media/posts/fixed/"), "{path}");
        assert!(path.ends_with(".png"), "{path}");
        let key = path.trim_start_matches("/media/");
        assert!(res["uploadUrl"].as_str().unwrap().contains(key));
        let (st, _) = run(&store, &v, Route::AdminUpload, None, &body).await;
        assert_eq!(st, 401);
    }

    #[tokio::test]
    async fn public_routes_skip_verification() {
        let store = seeded();
        let v = FakeVerifier::default();
        let (st, _) = run(&store, &v, Route::ListPublished, Some("forged"), b"").await;
        assert_eq!(st, 200);
        let (st, _) = run(&store, &v, Route::GetPublished(s("a")), None, b"").await;
        assert_eq!(st, 200);
        let (st, _) = run(&store, &v, Route::NotFound, None, b"").await;
        assert_eq!(st, 404);
        assert_eq!(v.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn user_token_header_is_case_insensitive() {
        for name in ["X-User-Token", "x-user-token", "X-USER-TOKEN"] {
            let mut h = HeaderMap::new();
            h.insert(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_static("tok"),
            );
            assert_eq!(user_token(&h), Some("tok"), "{name}");
        }
        let mut h = HeaderMap::new();
        assert_eq!(user_token(&h), None);
        h.insert("x-user-token", HeaderValue::from_static(""));
        assert_eq!(user_token(&h), None);
    }
}
