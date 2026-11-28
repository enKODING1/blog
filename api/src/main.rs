mod auth;
mod http;
mod posts;
mod router;
mod uploads;

use auth::CognitoVerifier;
use chrono::{DateTime, Utc};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use posts::store::DynamoStore;
use router::Deps;
use std::time::Instant;

/// JS `Date.prototype.toISOString` 과 같은 형식(UTC, 밀리초).
fn iso_timestamp(at: DateTime<Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

async fn handler(event: Request, deps: &Deps<'_>) -> Result<Response<Body>, Error> {
    let start = Instant::now();
    let method = event.method().clone();
    let path = event.raw_http_path().to_string();

    let route = router::route(&method, &path);
    let now = iso_timestamp(Utc::now());
    let token = router::user_token(event.headers());
    let res = router::dispatch(&route, token, event.body().as_ref(), deps, &now).await;

    // 메서드·경로·상태·ms 만 기록한다. 헤더·본문·토큰은 절대 로깅하지 않는다.
    tracing::info!(
        "{} {} {} {}ms",
        method,
        path,
        res.status().as_u16(),
        start.elapsed().as_millis()
    );
    Ok(res)
}

fn required_env(name: &str) -> String {
    match std::env::var(name) {
        Ok(v) if !v.is_empty() => v,
        _ => panic!("Missing env: {name}"),
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_ansi(false)
        .without_time()
        .with_target(false)
        .init();
    // 설정은 콜드 스타트에 한 번 읽는다. 없으면 init 오류로 바로 드러나게 한다.
    let table = required_env("TABLE_NAME");
    let bucket = required_env("MEDIA_BUCKET");
    let pool_id = required_env("COGNITO_USER_POOL_ID");
    let client_id = required_env("COGNITO_CLIENT_ID");

    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let region = config
        .region()
        .map(|r| r.to_string())
        .expect("Missing AWS region (AWS_REGION)");
    let store = DynamoStore {
        client: aws_sdk_dynamodb::Client::new(&config),
        table,
    };
    let s3 = uploads::s3_client(aws_sdk_s3::config::Builder::from(&config));
    let verifier = CognitoVerifier::new(&pool_id, &client_id, &region);
    let deps = Deps {
        store: &store,
        verifier: &verifier,
        s3: &s3,
        bucket: &bucket,
    };
    let deps = &deps;
    run(service_fn(move |event| handler(event, deps))).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn timestamp_matches_to_iso_string() {
        let at =
            Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap() + chrono::Duration::milliseconds(7);
        assert_eq!(iso_timestamp(at), "2026-01-02T03:04:05.007Z");
        let whole = Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap();
        assert_eq!(iso_timestamp(whole), "2026-01-02T03:04:05.000Z");
    }
}
