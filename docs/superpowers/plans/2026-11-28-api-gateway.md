# API Gateway + 단일 라우터 Lambda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js가 DynamoDB·S3에 직접 닿지 않고, 모든 AWS 리소스 요청이 IAM 인증 API Gateway → Rust 라우터 Lambda 하나를 거치게 한다.

**Architecture:** Rust Lambda `post-api`(cargo-lambda, arm64)가 `ANY /{proxy+}` 하나로 들어오는 요청을 메서드·경로로 라우팅해 DynamoDB·S3를 다룬다. 관리자 경로는 `X-User-Token`(Cognito ID 토큰)을 Lambda가 JWKS로 재검증한다. Next.js는 `src/lib/api/client.ts`로 SigV4 서명 요청만 보내고, 기존 `repo.ts`·`upload.ts`의 함수 이름은 유지한다. 인프라는 Terraform, 전환은 "추가 → 앱 전환 → 직접 권한 제거" 세 단계.

**Tech Stack:** Rust 1.100 + cargo-lambda 1.9 + `lambda_http`, `aws-sdk-dynamodb`, `aws-sdk-s3`, `jsonwebtoken`, `serde`; Next.js 15.5.29 + `@smithy/signature-v4`, `@aws-crypto/sha256-js`, `@aws-sdk/credential-providers`; Terraform aws ~> 6; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-28-api-gateway-design.md`

**작업 위치:** `/Users/skang/workspace/blog-dynamodb`, 브랜치 `feat/dynamodb-posts` (origin/main = a6a3d0b, 로컬 e577a1c). Rust는 `source "$HOME/.cargo/env"` 후 사용.

## Global Constraints

- AWS 계정 910107943804, 프로필 `seongjin`, ap-northeast-2. AWS 명령 전 `aws sts get-caller-identity --profile seongjin`. 만료 시 사용자에게 `aws login --profile seongjin` 요청.
- 이름: Lambda `blog-prod-post-api-lambda`, 실행 역할 `blog-prod-post-api-role`, API `blog-prod-post-api-apigw`, 로그 그룹 `/aws/lambda/blog-prod-post-api-lambda`(보존 14일). 태그 Project=blog/Environment=prod/ManagedBy=terraform.
- Lambda: Rust, `provided.al2023`, `arm64`, 256MB, 타임아웃 10초, VPC 없음. 바이너리 이름 `post-api`, zip `api/target/lambda/post-api/bootstrap.zip`(커밋 금지).
- Lambda 환경변수: `TABLE_NAME`, `MEDIA_BUCKET`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` (AWS 리전은 런타임 기본 `AWS_REGION`).
- API: HTTP API, 라우트 `ANY /{proxy+}` `authorization_type = "AWS_IAM"`, Lambda 프록시 payload 2.0, 스테이지 `$default` 자동 배포, 접근 로그 없음.
- 경로·상태 코드·본문은 스펙 "API 경로" 표 그대로. 관리자 헤더 `X-User-Token`. 401 `{"error":"unauthorized"}`, 403 `{"error":"forbidden"}`, 404 `{"error":"not_found"}`, 400 `{"errors":{필드:문구}}`, 409 `{"errors":{"slug":"이미 있는 주소입니다"}}`.
- 검증 규칙(현재 `validatePostInput`과 동일): slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`·200자 이하, date 실제 날짜 `YYYY-MM-DD`, title·category 공백 아닌 값, content UTF-8 350,000바이트 이하, status `draft|published`. 문구는 현재 `src/lib/posts/validate.ts`의 것을 그대로 복사.
- DynamoDB 항목: `pk="POST#"+slug`, 발행 글만 `gsi1pk="PUBLISHED"`, `gsi1sk=date+"#"+slug`, `createdAt` 생성 시 한 번, `updatedAt` 매번(UTC ISO, ms 포함 `toISOString` 형식). 응답에 `pk`·`gsi1pk`·`gsi1sk` 없음.
- 업로드: 타입 png→png, jpeg→jpg, gif→gif, webp→webp, 1 ≤ size ≤ 10*1024*1024 정수, 키 `posts/{slug}/{uuid}.{ext}`, 만료 300초, Content-Type·Content-Length 서명, `x-amz-checksum-*`·`x-amz-sdk-checksum-algorithm` 파라미터 없음, `markdownPath="/media/"+key`.
- Lambda 로그: 메서드·경로·상태 코드·처리 ms만. 헤더·본문·토큰 금지.
- Next.js `src/**`에서 `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` import 금지(ESLint로 강제).
- 기존 규칙: `.prettierrc`, `npm run lint/format:check/test/build`, `node scripts/check-build.mjs`가 AWS env 없이 통과. 커밋 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push·apply는 사용자 확인 후.

## Review Focus

1. **서명 없는 직접 호출** — 인터넷에서 API URL을 그냥 부르면 403이어야 한다. → Task 6 확인 단계(`curl` 403).
2. **토큰 없이 관리자 경로** — compute role 서명만 있고 `X-User-Token`이 없거나 위조·만료·그룹 없음이면 401/403, DB 미접근. → Task 3 테스트.
3. **본문 slug로 다른 글 덮어쓰기** — `PUT /admin/posts/a`에 본문 slug `b` → 항상 경로 slug `a`만 수정. → Task 2 테스트.
4. **Lambda 오류가 페이지 500으로 번짐** — 401/403은 `UnauthorizedError`, 404는 null/`PostNotFoundError`로 바뀌어 기존 화면 동작(로그인 배너·404 페이지) 유지. → Task 5 테스트.
5. **콜드 스타트 지연** — 첫 요청 1초 이내. → Task 6 측정(`curl -w %{time_total}`).

---

## File Structure

```
api/Cargo.toml, api/Cargo.lock
api/src/main.rs          lambda_http 진입점, 상태(클라이언트·설정) 초기화
api/src/router.rs        route(method, path) -> Route, dispatch
api/src/http.rs          JSON 응답 헬퍼, 오류 → 상태 코드
api/src/posts/model.rs   Post, PostSummary, PostInput, item 변환
api/src/posts/validate.rs
api/src/posts/store.rs   trait PostStore + DynamoStore + (test) MemStore
api/src/posts/handlers.rs
api/src/auth.rs          trait TokenVerifier + CognitoVerifier(JWKS 캐시)
api/src/uploads.rs       presign
package.json             scripts.build:api
.github/workflows/ci.yml Rust job
infra/api.tf             Lambda·역할·로그·API·권한
infra/amplify.tf         compute role 정책·환경변수 변경
src/lib/api/client.ts    SigV4 fetch + 오류 매핑
src/lib/posts/repo.ts    API 호출로 교체(함수 이름 유지, 관리자 함수에 token)
src/lib/media/upload.ts  API 호출로 교체
src/lib/config.ts        DataConfig = { region, apiUrl }
src/lib/auth/session.ts  getSessionToken()
src/app/admin/**         token 전달
삭제: src/lib/aws.ts, scripts/migrate-posts.ts, src/lib/posts/import.ts(+test, __fixtures__), posts/, public/images/posts/, scripts/check-images.mjs
```

---

### Task 1: Rust 프로젝트·라우터·HTTP 계약·빌드·CI

**Files:** Create `api/Cargo.toml`, `api/src/main.rs`, `api/src/router.rs`, `api/src/http.rs`, `api/.gitignore`(`target/`). Modify `package.json`, `.github/workflows/ci.yml`, `.gitignore`(`api/target/`).

**Interfaces:**

- Produces:
  - `enum Route { ListPublished, GetPublished(String), AdminList, AdminGet(String), AdminCreate, AdminUpdate(String), AdminDelete(String), AdminUpload, NotFound }`
  - `fn route(method: &http::Method, path: &str) -> Route` — 끝 `/` 하나 허용, slug 세그먼트는 비어 있지 않은 한 세그먼트(검증은 핸들러가), 다른 메서드는 `NotFound`.
  - `Route::requires_admin(&self) -> bool` (Admin\* → true)
  - `http.rs`: `json(status: u16, body: &impl Serialize) -> Response<Body>`, `enum ApiError { BadRequest(BTreeMap<String,String>), Unauthorized, Forbidden, NotFound, Conflict, Internal }`와 `impl From<ApiError> for Response<Body>`(Global Constraints 본문·코드, Internal은 500 `{"error":"internal"}`).
  - `main.rs`: 이 Task에서는 모든 라우트가 `ApiError::NotFound`가 아닌 501 `{"error":"not_implemented"}`를 돌려도 됨(Task 2·3에서 채움). 로그는 메서드·경로·상태·ms 한 줄(`tracing`).
  - `package.json` `"build:api": "cd api && cargo lambda build --release --arm64 --output-format zip"`
  - CI job `rust`(이름 `Rust`): checkout → `dtolnay/rust-toolchain@stable`(components clippy,rustfmt) → `Swatinem/rust-cache@v2`(workspaces `api`) → `pip install cargo-lambda` → `cd api && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test && cargo lambda build --release --arm64`.

- [ ] **Step 1: 실패하는 테스트** (`router.rs` `#[cfg(test)]`): `GET /posts`→ListPublished, `GET /posts/`→ListPublished, `GET /posts/a-b`→GetPublished("a-b"), `GET /posts/a/b`→NotFound, `POST /posts`→NotFound, `GET /admin/posts`→AdminList, `GET /admin/posts/x`→AdminGet, `POST /admin/posts`→AdminCreate, `PUT /admin/posts/x`→AdminUpdate, `DELETE /admin/posts/x`→AdminDelete, `POST /admin/uploads`→AdminUpload, `GET /`→NotFound, `GET /nope`→NotFound; `requires_admin` 참·거짓. `http.rs`: Conflict 응답 409 본문 `{"errors":{"slug":"이미 있는 주소입니다"}}`, Unauthorized 401 `{"error":"unauthorized"}`.
- [ ] **Step 2:** `cd api && cargo test` — Expected: FAIL(컴파일 또는 단언).
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** `cd api && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test && cd .. && npm run build:api && ls api/target/lambda/post-api/bootstrap.zip` — Expected: 모두 성공, zip 존재. `npm run lint && npm run format:check` 통과.
- [ ] **Step 5: Commit** `feat(api): Rust 라우터 Lambda 뼈대와 CI`

---

### Task 2: 글 모델·검증·저장소·핸들러

**Files:** Create `api/src/posts/{mod,model,validate,store,handlers}.rs`. Modify `api/src/main.rs`, `api/src/router.rs`(dispatch).

**Interfaces:**

- Consumes: `Route`, `ApiError`, `json`.
- Produces:
  - `model.rs`: `PostStatus { Draft, Published }`(serde 소문자), `PostInput { slug, title, category, date, content, status }`, `Post`(Input + `created_at`/`updated_at`, serde camelCase `createdAt`/`updatedAt`), `PostSummary`(content 없음). `fn to_item(&Post) -> HashMap<String, AttributeValue>`, `fn from_item(&HashMap<..>) -> Result<Post, ApiError>`.
  - `validate.rs`: `fn validate(input: &serde_json::Value) -> Result<PostInput, BTreeMap<String, String>>` (Global Constraints 규칙·문구).
  - `store.rs`: `#[async_trait] trait PostStore { list_published, list_all, get(slug), create(&Post) -> Result<(), ApiError::Conflict>, update(slug, &PostInput 필드, updated_at) -> Result<Post, ApiError::NotFound>, delete(slug) }`, `DynamoStore { client, table }`(Query `gsi1` 내림차순·페이지네이션 끝까지, Scan projection content 제외·date 내림차순, 조건식 `attribute_not_exists(pk)`/`attribute_exists(pk)`, 발행↔초안 시 gsi 키 SET/REMOVE), `#[cfg(test)] MemStore`.
  - `handlers.rs`: `async fn handle_posts(route: &Route, body: &[u8], store: &dyn PostStore, now: &str) -> Result<Response<Body>, ApiError>` — GetPublished는 초안이면 404, AdminCreate 201, AdminUpdate는 **경로 slug 사용**(본문 slug 무시, 본문 slug가 없어도 검증 통과하도록 경로 slug를 넣어 검증), AdminDelete 204(없어도 204).
  - `main.rs`: 실제 `now`(UTC `%Y-%m-%dT%H:%M:%S%.3fZ`)와 `DynamoStore`를 연결. 관리자 경로 인증은 Task 3 전까지 임시로 통과(주석으로 표시, Task 3가 교체).

- [ ] **Step 1: 실패하는 테스트.** validate: 기존 slug 6개(`42-piscine`,`browser-rendering`,`fixed`,`minishell`,`nand2tetris`,`naval-sw-developer`) 통과, `"Hello"`·`"a--b"`·`"한글"`·`"-a"`·201자 거부, `2025-02-30`·`2025-13-01` 거부, 빈 title/category 거부, content 350,001바이트 거부(한글 3바이트 경계), status `"hidden"` 거부. model: `to_item` 발행 → `gsi1pk`/`gsi1sk` 있음, 초안 → 없음, `from_item(to_item(p)) == p`. handlers(MemStore): 초안 GetPublished 404, AdminCreate 같은 slug 두 번째 409 본문, **AdminUpdate 경로 a·본문 slug b → a만 바뀌고 b 미생성**, AdminUpdate 없는 slug 404, AdminDelete 없는 slug 204, ListPublished가 초안 제외·날짜 내림차순, 응답 JSON에 `pk` 키 없음.
- [ ] **Step 2:** `cargo test` — Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): 글 CRUD 핸들러와 DynamoDB 저장소`

---

### Task 3: 관리자 토큰 검증과 업로드 URL

**Files:** Create `api/src/auth.rs`, `api/src/uploads.rs`. Modify `api/src/main.rs`, `api/src/router.rs`.

**Interfaces:**

- Produces:
  - `auth.rs`: `#[async_trait] trait TokenVerifier { async fn verify(&self, token: &str) -> Result<Claims, AuthError> }`, `enum AuthError { Invalid, NotAdmin }`, `Claims { sub, email, groups }`. `CognitoVerifier { pool_id, client_id, region }`: JWKS `https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json`를 처음 필요할 때 받아 실행 환경 동안 캐시(kid 못 찾으면 한 번 재조회). RS256, `iss` = `https://cognito-idp.{region}.amazonaws.com/{pool_id}`, `aud` = client_id, `token_use` = `"id"`, `exp` 검사, `cognito:groups`에 `blog-admin` 없으면 `NotAdmin`.
  - 디스패치: `route.requires_admin()`이면 `X-User-Token` 없음·`Invalid` → 401, `NotAdmin` → 403, 통과해야 핸들러 실행(DB 접근 전).
  - `uploads.rs`: `fn plan_upload(slug, content_type, size, uuid) -> Result<(String /*key*/, String /*ext*/), BTreeMap<String,String>>`(순수), `async fn presign_put(client: &aws_sdk_s3::Client, bucket, key, content_type, size) -> Result<String, ApiError>` — S3 클라이언트는 `request_checksum_calculation(WhenRequired)`·`response_checksum_validation(WhenRequired)`로 만든다. 응답 `{ uploadUrl, markdownPath }`.

- [ ] **Step 1: 실패하는 테스트.** auth: 테스트용 RSA 키로 만든 토큰과 고정 JWKS를 넣은 verifier(`CognitoVerifier::with_jwks` 같은 테스트 생성자)로 — 정상·그룹 있음 → Ok, 그룹 없음 → NotAdmin, 만료 → Invalid, aud 다름 → Invalid, `token_use=access` → Invalid, 서명 위조(다른 키) → Invalid, iss 다름 → Invalid. 디스패치(가짜 verifier + MemStore): 토큰 없는 `POST /admin/posts` 401이고 MemStore에 아무 것도 안 생김, NotAdmin 403. uploads: `plan_upload("fixed","image/png",1,uuid)` → `posts/fixed/<uuid>.png`, `image/svg+xml`·`size 0`·`10*1024*1024+1`·slug `"../x"` 거부. presign: 가짜 정적 자격 증명 S3 클라이언트로 만든 URL의 `X-Amz-SignedHeaders`에 `content-length`·`content-type` 포함, `x-amz-checksum-crc32`·`x-amz-sdk-checksum-algorithm` 없음, 만료 300.
- [ ] **Step 2:** `cargo test` — Expected: FAIL.
- [ ] **Step 3: 구현.** Task 2의 임시 통과 제거.
- [ ] **Step 4:** `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test && cd .. && npm run build:api` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): 관리자 토큰 재검증과 업로드 URL 발급`

---

### Task 4: Terraform — API·Lambda 추가 (1단계, 기존 권한 유지)

**Files:** Create `infra/api.tf`. Modify `infra/amplify.tf`(compute role에 Invoke 문장 **추가**, 환경변수 `BLOG_API_URL` **추가** — 기존 것은 유지), `infra/outputs.tf`(`api_url`).

**Interfaces:**

- Produces: `aws_lambda_function.post_api`(filename `${path.module}/../api/target/lambda/post-api/bootstrap.zip`, `source_code_hash = filebase64sha256(...)`, handler `bootstrap`), `aws_iam_role.post_api` + 정책(테이블·`index/*` 6개 액션, 미디어 `posts/*` PutObject, 로그 그룹에 CreateLogStream/PutLogEvents), `aws_cloudwatch_log_group`(14일), `aws_apigatewayv2_api`(HTTP, `blog-prod-post-api-apigw`), `aws_apigatewayv2_integration`(AWS_PROXY, payload `2.0`), `aws_apigatewayv2_route` `ANY /{proxy+}` `AWS_IAM`, `aws_apigatewayv2_stage` `$default` auto_deploy, `aws_lambda_permission`(source_arn `${api.execution_arn}/*/*`). compute role에 `execute-api:Invoke` on `${api.execution_arn}/*/*/*`. 출력 `api_url = aws_apigatewayv2_api.post_api.api_endpoint`(끝 슬래시 없음).
- Global Constraints의 이름·환경변수·사양 그대로.

- [ ] **Step 1: 작성.**
- [ ] **Step 2:** `npm run build:api && terraform fmt -check -recursive && (cd infra && terraform init -backend=false && terraform validate)` — Expected: valid. (plan/apply는 Task 6.)
- [ ] **Step 3: Commit** `feat(infra): API Gateway와 라우터 Lambda (1단계)`

---

### Task 5: Next.js를 API 호출로 전환하고 직접 접근 코드 삭제

**Files:**

- Create `src/lib/api/client.ts`, `src/lib/api/client.test.ts`.
- Modify `src/lib/posts/repo.ts`(+test 재작성), `src/lib/media/upload.ts`(+test 재작성), `src/lib/config.ts`(+test), `src/lib/auth/session.ts`, `src/app/admin/actions.ts`(+test), `src/app/admin/page.tsx`, `src/app/admin/[slug]/edit/page.tsx`, `.eslintrc.json`, `package.json`, `.github/workflows/ci.yml`, `README.md`.
- Delete `src/lib/aws.ts`, `scripts/migrate-posts.ts`, `src/lib/posts/import.ts`, `src/lib/posts/import.test.ts`, `src/lib/posts/__fixtures__/`, `posts/`, `public/images/posts/`, `scripts/check-images.mjs`.

**Interfaces:**

- Consumes: API 계약(Global Constraints).
- Produces:
  - `config.ts`: `DataConfig = { region: string; apiUrl: string }`(`BLOG_AWS_REGION`, `BLOG_API_URL`), `AppConfig`는 나머지 그대로.
  - `client.ts`: `apiRequest<T>(method: "GET"|"POST"|"PUT"|"DELETE", path: string, opts?: { body?: unknown; userToken?: string }): Promise<{ status: number; body: T | null }>` — `@smithy/signature-v4` `SignatureV4({ service: "execute-api", region, credentials: fromNodeProviderChain(), sha256: Sha256 })`로 서명(호스트·경로·쿼리·`content-type`·`x-user-token` 포함), `fetch` + `AbortSignal.timeout(8000)`, 재시도 없음. 2xx·400·401·403·404·409는 상태와 JSON(204는 null)을 반환, 그 외 상태는 `Error("API <status>")`. 모듈 import 시 env 읽지 않음.
  - `repo.ts`: `listPublishedPosts()`, `getPublishedPost(slug)`(404 → null), `listAllPosts(token)`, `getPost(token, slug)`(404 → null), `createPost(token, input): Promise<Post>`(400 → `ValidationError(errors)`, 409 → `PostExistsError`), `updatePost(token, slug, input: Omit<PostInput,"slug">): Promise<Post>`(404 → `PostNotFoundError`, 400 → `ValidationError`), `deletePost(token, slug)`. 401·403 → `UnauthorizedError`(`@/lib/auth/session`에서 import). `ValidationError extends Error { errors: Record<string,string> }` 새로 export. `putPost` 삭제.
  - `upload.ts`: `createImageUpload(token, { slug, contentType, size })` → `POST /admin/uploads`, 400 → 기존처럼 `Error`, 401/403 → `UnauthorizedError`. `ALLOWED_IMAGE_TYPES`·`MAX_IMAGE_BYTES`는 클라이언트 쪽 사전 검사용으로 유지.
  - `session.ts`: `getSessionToken(): Promise<string | null>` — `getAdminSession()`이 통과했을 때만 쿠키 원문 반환. `requireAdminToken(): Promise<string>`(없으면 `UnauthorizedError`).
  - `actions.ts`: 각 액션 첫 줄 `const token = await requireAdminToken();`(기존 `requireAdmin` 대체), repo/upload에 token 전달, `ValidationError` → `{ ok:false, errors }`, 기존 `PostExistsError`·`PostNotFoundError` 매핑 유지. 관리자 페이지는 `requireAdminPage` 뒤 `getSessionToken()`으로 token을 얻어 호출.
  - `.eslintrc.json`: `no-restricted-imports` paths 4개(Global Constraints) — 메시지 "AWS 리소스는 API Gateway를 거쳐 호출합니다 (src/lib/api/client.ts)".
  - `package.json`: 위 4개 SDK 패키지 제거, `@smithy/signature-v4`·`@aws-crypto/sha256-js`·`@aws-sdk/credential-providers` 추가, `gray-matter`·`tsx` 제거(이전 스크립트 삭제로 미사용이면).
  - `ci.yml`: `check-images.mjs` 단계 제거.
  - `README.md`: 구조(브라우저 → Amplify(Next.js) → API Gateway(IAM) → Lambda(Rust) → DynamoDB/S3), 로컬 실행(`.env.local`의 `BLOG_API_URL`, `AWS_PROFILE=seongjin npm run dev`), API 빌드(`npm run build:api`), 배포(main push → Amplify, 인프라·Lambda는 `terraform apply`).

- [ ] **Step 1: 실패하는 테스트.** client: `fetch` 목킹 — 요청 헤더에 `authorization`(AWS4-HMAC-SHA256)·`x-amz-date`가 있고 `x-user-token` 전달, 404 → `{status:404}`, 500 → throw, 타임아웃 → throw(가짜 자격 증명은 `vi.mock("@aws-sdk/credential-providers")`). repo: `apiRequest` 목킹 — 409 → `PostExistsError`, 401 → `UnauthorizedError`, 403 → `UnauthorizedError`, `getPublishedPost` 404 → null, `updatePost` 404 → `PostNotFoundError`, 400 → `ValidationError.errors`. actions: 토큰 없음(`requireAdminToken` throw) → repo 미호출(Review Focus 3 유지), `ValidationError` → `{ok:false,errors}`. config: `BLOG_API_URL` 없으면 `Missing env: BLOG_API_URL`.
- [ ] **Step 2:** `npm test` — Expected: FAIL.
- [ ] **Step 3: 구현과 삭제.**
- [ ] **Step 4:** `grep -rn "@aws-sdk/client-dynamodb\|@aws-sdk/lib-dynamodb\|@aws-sdk/client-s3\|s3-request-presigner" src scripts` — Expected: 결과 없음. `npm ci && npm test && npm run lint && npm run format:check && npm run build && node scripts/check-build.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: AWS 리소스 호출을 API Gateway 경유로 전환, 직접 접근 코드 삭제`

---

### Task 6: 배포 (사용자 확인 단계마다)

- [ ] **Step 1:** `aws sts get-caller-identity --profile seongjin` → 910107943804. `npm run build:api`.
- [ ] **Step 2: 1단계 apply.** `cd infra && TF_VAR_cloudflare_zone_id=580e154446b7eeb88bfe01961c92a658 CLOUDFLARE_API_TOKEN=$(cat .cloudflare-token) terraform plan -out=…` → 추가(Lambda·API·역할·로그)와 compute role Invoke 추가·환경변수 `BLOG_API_URL` 추가만인지 확인 → 사용자 승인 → apply.
- [ ] **Step 3: API 직접 확인.** 서명 없이 `curl -s -o /dev/null -w "%{http_code}" $API_URL/posts` → 403(Review Focus 1). 서명 요청(`awscurl` 대신 Node 한 줄 스크립트 또는 `aws` CLI 서명 불가 시 `npx` 임시 스크립트, 운영자 seongjin 자격 증명) `GET /posts` → 200, 글 6개. 첫 요청·두 번째 요청 `time_total` 기록(Review Focus 5).
- [ ] **Step 4: 앱 전환.** 사용자 승인 후 `git push origin feat/dynamodb-posts:main` → CI(`Lint / Build`, `Secret scan`, `Terraform`, `Rust`) 성공·Amplify 빌드 성공 → `blog.skang.dev` 목록·상세·404 확인, 사용자에게 관리자 작성·수정·삭제·이미지 업로드 확인 요청.
- [ ] **Step 5: 2단계 apply(직접 권한 제거).** `infra/amplify.tf`에서 compute role의 DynamoDB·S3 문장과 Amplify 환경변수 `BLOG_POSTS_TABLE`·`BLOG_MEDIA_BUCKET` 삭제 → 커밋 `feat(infra): compute role의 DynamoDB·S3 직접 권한 제거 (2단계)` → plan(삭제만 있는지) → 사용자 승인 → apply → Amplify 재빌드(환경변수 반영) → Step 4 확인 반복. 확인: `aws iam get-role-policy --role-name blog-prod-web-ssr-role --policy-name …`에 dynamodb·s3 없음.
- [ ] **Step 6:** push(2단계 커밋), 결과 보고.
