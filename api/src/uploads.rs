//! 이미지 업로드용 S3 presigned PUT URL 발급. 규칙은 기존 `createImageUpload` 와 같다.

use crate::http::{json, ApiError};
use crate::posts::validate::is_valid_slug;
use aws_sdk_s3::config::{RequestChecksumCalculation, ResponseChecksumValidation};
use aws_sdk_s3::error::ProvideErrorMetadata;
use aws_sdk_s3::presigning::PresigningConfig;
use lambda_http::{Body, Response};
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::Duration;
use uuid::Uuid;

pub const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
pub const EXPIRES_IN: Duration = Duration::from_secs(300);

/// SVG 는 스크립트를 품을 수 있어 일부러 뺀다.
pub fn ext_for(content_type: &str) -> Option<&'static str> {
    match content_type {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

/// 입력을 검증하고 `(key, ext)` 를 돌려준다. 오류 문구는 기존 `createImageUpload` 의 것.
pub fn plan_upload(
    slug: &str,
    content_type: &str,
    size: u64,
    uuid: &Uuid,
) -> Result<(String, String), BTreeMap<String, String>> {
    let mut errors = BTreeMap::new();
    // slug 패턴이 `/`·`.` 를 막으므로 키가 `posts/{slug}/` 밖으로 나갈 수 없다.
    if !is_valid_slug(slug) {
        errors.insert("slug".into(), "Invalid slug".into());
    }
    let ext = ext_for(content_type);
    if ext.is_none() {
        errors.insert("contentType".into(), "Unsupported image type".into());
    }
    if size == 0 || size > MAX_IMAGE_BYTES {
        errors.insert("size".into(), "Invalid image size".into());
    }
    match ext {
        Some(ext) if errors.is_empty() => Ok((
            format!("posts/{slug}/{}.{ext}", uuid.hyphenated()),
            ext.to_string(),
        )),
        _ => Err(errors),
    }
}

/// 체크섬 설정을 WhenRequired 로 고정한 S3 클라이언트.
/// (기본값이면 presigned URL 에 `x-amz-checksum-crc32` 등이 붙어 브라우저 PUT 이 깨진다.)
pub fn s3_client(builder: aws_sdk_s3::config::Builder) -> aws_sdk_s3::Client {
    let config = builder
        .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
        .response_checksum_validation(ResponseChecksumValidation::WhenRequired)
        .build();
    aws_sdk_s3::Client::from_conf(config)
}

/// Content-Type·Content-Length 를 서명한 5분짜리 PUT URL.
pub async fn presign_put(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    content_type: &str,
    size: u64,
) -> Result<String, ApiError> {
    let length = i64::try_from(size).map_err(|_| ApiError::Internal)?;
    let config = PresigningConfig::expires_in(EXPIRES_IN).map_err(|_| ApiError::Internal)?;
    let req = client
        .put_object()
        .bucket(bucket)
        .key(key)
        .content_type(content_type)
        .content_length(length)
        .presigned(config)
        .await
        .map_err(|e| {
            // 오류 코드만 남긴다(메시지·헤더·본문 금지).
            tracing::error!("s3 presign failed: code={}", e.code().unwrap_or("none"));
            ApiError::Internal
        })?;
    Ok(req.uri().to_string())
}

/// `POST /admin/uploads` 본문 `{ slug, contentType, size }` → 200 `{ uploadUrl, markdownPath }`.
pub async fn handle_upload(
    body: &[u8],
    client: &aws_sdk_s3::Client,
    bucket: &str,
    uuid: &Uuid,
) -> Result<Response<Body>, ApiError> {
    let input: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let slug = input["slug"].as_str().unwrap_or("");
    let content_type = input["contentType"].as_str().unwrap_or("");
    // 정수가 아니거나 음수면 0 으로 보고 크기 오류로 거부한다.
    let size = input["size"].as_u64().unwrap_or(0);
    let (key, _ext) = plan_upload(slug, content_type, size, uuid).map_err(ApiError::BadRequest)?;
    let upload_url = presign_put(client, bucket, &key, content_type, size).await?;
    Ok(json(
        200,
        &serde_json::json!({
            "uploadUrl": upload_url,
            "markdownPath": format!("/media/{key}"),
        }),
    ))
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};

    pub fn test_client() -> aws_sdk_s3::Client {
        let builder = aws_sdk_s3::config::Builder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new("ap-northeast-2"))
            .credentials_provider(Credentials::new(
                "AKIDEXAMPLE",
                "fake-secret",
                None,
                None,
                "test",
            ));
        s3_client(builder)
    }

    fn uuid() -> Uuid {
        Uuid::parse_str("123e4567-e89b-42d3-a456-426614174000").unwrap()
    }

    fn query(url: &str) -> BTreeMap<String, String> {
        let q = url.split_once('?').map(|(_, q)| q).unwrap_or("");
        q.split('&')
            .filter_map(|kv| kv.split_once('='))
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn plans_key_and_ext() {
        assert_eq!(
            plan_upload("fixed", "image/png", 1, &uuid()),
            Ok((
                "posts/fixed/123e4567-e89b-42d3-a456-426614174000.png".to_string(),
                "png".to_string()
            ))
        );
        for (ct, ext) in [
            ("image/jpeg", "jpg"),
            ("image/gif", "gif"),
            ("image/webp", "webp"),
        ] {
            let (key, got) = plan_upload("a-b", ct, MAX_IMAGE_BYTES, &uuid()).unwrap();
            assert_eq!(got, ext);
            assert!(key.ends_with(&format!(".{ext}")), "{key}");
        }
    }

    #[test]
    fn rejects_bad_input() {
        let err = |slug, ct, size| plan_upload(slug, ct, size, &uuid()).unwrap_err();
        assert_eq!(
            err("fixed", "image/svg+xml", 1)["contentType"],
            "Unsupported image type"
        );
        assert_eq!(
            err("fixed", "text/html", 1)["contentType"],
            "Unsupported image type"
        );
        assert_eq!(err("fixed", "image/png", 0)["size"], "Invalid image size");
        assert_eq!(
            err("fixed", "image/png", MAX_IMAGE_BYTES + 1)["size"],
            "Invalid image size"
        );
        assert_eq!(err("../x", "image/png", 1)["slug"], "Invalid slug");
        assert_eq!(err("", "image/png", 1)["slug"], "Invalid slug");
        assert_eq!(err("Fixed", "image/png", 1)["slug"], "Invalid slug");
        assert_eq!(err("../x", "image/svg+xml", 0).len(), 3);
    }

    #[tokio::test]
    async fn presigned_url_signs_type_and_length_without_checksum() {
        let client = test_client();
        let url = presign_put(
            &client,
            "blog-media",
            "posts/fixed/x.png",
            "image/png",
            1234,
        )
        .await
        .unwrap();
        assert!(url.starts_with("https://"), "{url}");
        assert!(url.contains("posts/fixed/x.png"), "{url}");
        let q = query(&url);
        let signed = q["X-Amz-SignedHeaders"].replace("%3B", ";");
        let signed: Vec<&str> = signed.split(';').collect();
        assert!(signed.contains(&"content-length"), "{signed:?}");
        assert!(signed.contains(&"content-type"), "{signed:?}");
        assert_eq!(q["X-Amz-Expires"], "300");
        let lower = url.to_ascii_lowercase();
        assert!(!lower.contains("x-amz-checksum-crc32"), "{url}");
        assert!(!lower.contains("x-amz-sdk-checksum-algorithm"), "{url}");
        assert!(!lower.contains("x-amz-checksum"), "{url}");
    }

    async fn call(body: Value) -> (u16, Value) {
        let bytes = serde_json::to_vec(&body).unwrap();
        let res = handle_upload(&bytes, &test_client(), "blog-media", &uuid())
            .await
            .unwrap_or_else(Into::into);
        let status = res.status().as_u16();
        let v = match res.body() {
            Body::Text(t) => serde_json::from_str(t).unwrap(),
            _ => Value::Null,
        };
        (status, v)
    }

    #[tokio::test]
    async fn handler_returns_url_and_markdown_path() {
        let (st, v) = call(serde_json::json!({
            "slug": "fixed", "contentType": "image/webp", "size": 2048
        }))
        .await;
        assert_eq!(st, 200);
        assert_eq!(
            v["markdownPath"],
            "/media/posts/fixed/123e4567-e89b-42d3-a456-426614174000.webp"
        );
        let url = v["uploadUrl"].as_str().unwrap();
        assert!(
            url.contains("/posts/fixed/123e4567-e89b-42d3-a456-426614174000.webp?"),
            "{url}"
        );
    }

    #[tokio::test]
    async fn handler_rejects_bad_body() {
        let (st, v) = call(serde_json::json!({
            "slug": "fixed", "contentType": "image/png", "size": 1.5
        }))
        .await;
        assert_eq!(st, 400);
        assert_eq!(v["errors"]["size"], "Invalid image size");
        let (st, v) = call(serde_json::json!({ "slug": "fixed", "size": -1 })).await;
        assert_eq!(st, 400);
        assert_eq!(v["errors"]["contentType"], "Unsupported image type");
        assert_eq!(v["errors"]["size"], "Invalid image size");
        let (st, v) = call(Value::Null).await;
        assert_eq!(st, 400);
        assert_eq!(v["errors"].as_object().unwrap().len(), 3);
    }
}
