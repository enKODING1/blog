use crate::http::json;
use crate::posts::handlers::handle_posts;
use crate::posts::store::PostStore;
use lambda_http::{http::Method, Body, Response};

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
    // TODO(task3): dispatch 에서 관리자 토큰 검증에 사용한다.
    #[allow(dead_code)]
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

/// 라우트를 처리하고 오류를 상태 코드 응답으로 바꾼다.
pub async fn dispatch(
    route: &Route,
    body: &[u8],
    store: &dyn PostStore,
    now: &str,
) -> Response<Body> {
    // TODO(task3): route.requires_admin() 이면 X-User-Token 을 검증해 401/403 을 돌려준다.
    // Task 3 전까지 관리자 경로는 임시로 인증 없이 통과한다(API Gateway IAM 서명만 있음).
    let result = match route {
        // TODO(task3): 업로드 URL 발급.
        Route::AdminUpload => Ok(json(
            501,
            &serde_json::json!({ "error": "not_implemented" }),
        )),
        _ => handle_posts(route, body, store, now).await,
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
}
