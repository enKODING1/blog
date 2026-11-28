mod http;
mod posts;
mod router;

use chrono::{DateTime, Utc};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use posts::store::{DynamoStore, PostStore};
use std::time::Instant;

/// JS `Date.prototype.toISOString` 과 같은 형식(UTC, 밀리초).
fn iso_timestamp(at: DateTime<Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

async fn handler(event: Request, store: &dyn PostStore) -> Result<Response<Body>, Error> {
    let start = Instant::now();
    let method = event.method().clone();
    let path = event.raw_http_path().to_string();

    let route = router::route(&method, &path);
    let now = iso_timestamp(Utc::now());
    let res = router::dispatch(&route, event.body().as_ref(), store, &now).await;

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

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_ansi(false)
        .without_time()
        .with_target(false)
        .init();
    let table = std::env::var("TABLE_NAME").map_err(|_| "Missing env: TABLE_NAME")?;
    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
    let store = DynamoStore {
        client: aws_sdk_dynamodb::Client::new(&config),
        table,
    };
    let store = &store;
    run(service_fn(move |event| handler(event, store))).await
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
