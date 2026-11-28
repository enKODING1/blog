use lambda_http::{http::header::CONTENT_TYPE, Body, Response};
use serde::Serialize;
use std::collections::BTreeMap;

pub fn json(status: u16, body: &impl Serialize) -> Response<Body> {
    let text = serde_json::to_string(body).unwrap_or_else(|_| r#"{"error":"internal"}"#.into());
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::Text(text))
        .expect("valid response")
}

#[derive(Debug)]
#[allow(dead_code)] // Task 2·3 에서 사용
pub enum ApiError {
    BadRequest(BTreeMap<String, String>),
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    Internal,
}

impl From<ApiError> for Response<Body> {
    fn from(err: ApiError) -> Self {
        match err {
            ApiError::BadRequest(errors) => json(400, &serde_json::json!({ "errors": errors })),
            ApiError::Unauthorized => json(401, &serde_json::json!({ "error": "unauthorized" })),
            ApiError::Forbidden => json(403, &serde_json::json!({ "error": "forbidden" })),
            ApiError::NotFound => json(404, &serde_json::json!({ "error": "not_found" })),
            ApiError::Conflict => json(
                409,
                &serde_json::json!({ "errors": { "slug": "이미 있는 주소입니다" } }),
            ),
            ApiError::Internal => json(500, &serde_json::json!({ "error": "internal" })),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(err: ApiError) -> (u16, String) {
        let res: Response<Body> = err.into();
        let body = match res.body() {
            Body::Text(t) => t.clone(),
            _ => String::new(),
        };
        (res.status().as_u16(), body)
    }

    #[test]
    fn conflict() {
        assert_eq!(
            parts(ApiError::Conflict),
            (
                409,
                r#"{"errors":{"slug":"이미 있는 주소입니다"}}"#.to_string()
            )
        );
    }

    #[test]
    fn simple_errors() {
        assert_eq!(
            parts(ApiError::Unauthorized),
            (401, r#"{"error":"unauthorized"}"#.into())
        );
        assert_eq!(
            parts(ApiError::Forbidden),
            (403, r#"{"error":"forbidden"}"#.into())
        );
        assert_eq!(
            parts(ApiError::NotFound),
            (404, r#"{"error":"not_found"}"#.into())
        );
        assert_eq!(
            parts(ApiError::Internal),
            (500, r#"{"error":"internal"}"#.into())
        );
    }

    #[test]
    fn bad_request() {
        let mut m = BTreeMap::new();
        m.insert("title".to_string(), "x".to_string());
        assert_eq!(
            parts(ApiError::BadRequest(m)),
            (400, r#"{"errors":{"title":"x"}}"#.into())
        );
    }
}
