mod http;
mod router;

use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use std::time::Instant;

async fn handler(event: Request) -> Result<Response<Body>, Error> {
    let start = Instant::now();
    let method = event.method().clone();
    let path = event.raw_http_path().to_string();

    // Task 2·3에서 실제 핸들러로 교체한다.
    let _route = router::route(&method, &path);
    let res = http::json(501, &serde_json::json!({ "error": "not_implemented" }));

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
    run(service_fn(handler)).await
}
