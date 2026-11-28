# API Gateway + 단일 라우터 Lambda로 AWS 접근 경계 만들기 설계

작성일: 2026-11-28

## 의도

지금은 Amplify에서 도는 Next.js 서버가 AWS SDK로 DynamoDB와 S3에 **직접** 닿는다(`src/lib/posts/repo.ts`, `src/lib/media/upload.ts`, compute role에 DynamoDB·S3 권한). 사용자는 앱이 리소스에 직접 닿는 구조를 원하지 않는다. 이유는 **보안 경계**다.

바꿀 구조:

```
요청 → Next.js 서버 ──SigV4 서명 HTTPS──▶ API Gateway(HTTP API, IAM 인증)
                                         └─▶ API Lambda(Rust, 라우터 하나) ─▶ DynamoDB / S3
```

Lambda 하나가 라우터로 메서드·경로를 보고 맞는 처리 함수로 보낸다. Next.js에는 AWS 리소스에 직접 닿는 코드가 남지 않는다.

## 목표

- 글 조회·작성·수정·삭제와 이미지 업로드 URL 발급을 모두 **API Gateway → 단일 Rust Lambda**로 옮긴다.
- API Gateway는 **IAM(SigV4) 인증**만 받는다. 호출할 수 있는 주체는 Amplify compute role(과 운영자 계정)뿐이다.
- Amplify compute role에서 DynamoDB·S3 권한을 **모두 제거**하고 `execute-api:Invoke`(이 API만)만 남긴다.
- 쓰기·관리 경로는 사용자 Cognito ID 토큰을 함께 받아 **Lambda가 직접 다시 검증**한다(`blog-admin` 그룹). Next.js의 기존 `requireAdmin()` 검사는 그대로 둔다(이중 확인).
- 화면·동작은 사용자 입장에서 지금과 똑같다.

## 비목표

- 외부(모바일 앱·다른 서비스)에 공개하는 API, API 키, 요청 수 제한, WAF, API 전용 도메인.
- Cognito 로그인 흐름 변경(토큰 교환은 AWS 리소스 호출이 아니므로 Next.js에 그대로 둔다).
- `/media/*` 이미지 서빙 방식 변경(Amplify 리라이트 → S3 공개 읽기 그대로), 브라우저 → S3 직접 업로드 방식 변경.
- 마크다운 렌더링 위치 변경(Next.js 그대로).

## 안티 목표

- Next.js(또는 compute role)가 여전히 DynamoDB·S3에 닿을 수 있는 상태가 남는 것.
- 서명 없이 인터넷에서 API를 호출할 수 있는 것.
- Next.js가 뚫렸을 때 사용자 토큰 없이 글을 쓰거나 지울 수 있는 것.
- 전환 중에 블로그가 멈추거나 글이 안 보이는 시간이 생기는 것.
- 응답이 눈에 띄게 느려지는 것(콜드 스타트 포함 첫 요청 1초 이내, 이후 수십 ms 증가 이내).

## 제약

- CLAUDE.md: Lambda는 **Rust**(`cargo lambda`, `provided.al2023`, `arm64`). 리소스 이름 `blog-prod-{도메인}-{기능}-{리소스종류}`, 태그 Project/Environment/ManagedBy, 계정 910107943804·프로필 seongjin·서울 리전, Terraform.
- API Gateway HTTP API의 경로별 권한은 IAM 하나만 쓸 수 있다(같은 경로에 IAM과 JWT authorizer를 함께 걸 수 없음) → 사용자 토큰 검증은 Lambda 안에서.
- SigV4가 `Authorization` 헤더를 쓰므로 사용자 토큰은 별도 헤더(`X-User-Token`)로 보낸다.
- 로컬 Mac에 `cargo-lambda`는 있으나 Rust 툴체인(rustup/rustc/cargo)이 없다 → 설치는 사용자 확인 후.
- CI에는 AWS 자격 증명이 없다(빌드·검사만). 인프라·Lambda 배포는 지금처럼 로컬에서 `terraform apply`.

## 접근 방식

| 안                                                              | 내용                                           | 판단                           |
| --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| A. HTTP API + 쓰기만 JWT authorizer                             | 읽기 API가 인터넷에 공개                       | 보안 경계 목적에 약함          |
| **B. HTTP API + IAM 인증 + Lambda가 사용자 토큰 재검증 (선택)** | 서명 없이는 호출 불가, compute role은 Invoke만 | 목적에 가장 맞음               |
| C. REST API + Cognito authorizer + WAF                          | 기능 많음                                      | 요금 약 3.5배·WAF 고정비, 과함 |

Lambda는 사용자 요청대로 **라우터 하나**(경로마다 따로 만들지 않음).

## 설계

### API 경로 (Lambda 라우터)

모든 경로는 API Gateway의 `ANY /{proxy+}` 한 라우트(IAM 인증) → Lambda 하나(payload v2). 라우팅은 Lambda 안에서.

| 메서드 · 경로                | 사용자 토큰 | 동작                                          | 응답                                                       |
| ---------------------------- | ----------- | --------------------------------------------- | ---------------------------------------------------------- |
| `GET /posts`                 | 불필요      | 발행된 글 목록(GSI `gsi1`, 날짜 내림차순)     | 200 `PostSummary[]`                                        |
| `GET /posts/{slug}`          | 불필요      | 발행된 글 하나                                | 200 `Post` / 404                                           |
| `GET /admin/posts`           | 필요        | 전체 글 목록(초안 포함)                       | 200 `PostSummary[]`                                        |
| `GET /admin/posts/{slug}`    | 필요        | 글 하나(초안 포함)                            | 200 `Post` / 404                                           |
| `POST /admin/posts`          | 필요        | 새 글(`attribute_not_exists`)                 | 201 `Post` / 409 `{ errors: { slug } }` / 400 `{ errors }` |
| `PUT /admin/posts/{slug}`    | 필요        | 수정(slug는 경로 값, 본문 slug 무시)          | 200 `Post` / 404 / 400                                     |
| `DELETE /admin/posts/{slug}` | 필요        | 삭제                                          | 204                                                        |
| `POST /admin/uploads`        | 필요        | 업로드 URL 발급 `{ slug, contentType, size }` | 200 `{ uploadUrl, markdownPath }` / 400                    |
| 그 외                        | —           | —                                             | 404 `{ error: "not_found" }`                               |

- 사용자 토큰: `X-User-Token: <Cognito ID 토큰>`. Lambda가 JWKS(풀 `ap-northeast-2_XzC76Ug95`)로 서명·만료·`aud = 앱 클라이언트 ID`·`token_use = id`·`cognito:groups`에 `blog-admin` 포함을 확인. 없거나 틀리면 401(`{ error: "unauthorized" }`), 그룹 없음 403. JWKS는 Lambda 실행 환경 안에서 캐시.
- 입력 검증 규칙은 지금 `validatePostInput`과 같다(slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`·200자 이하, date 실제 날짜 YYYY-MM-DD, title·category 비어 있지 않음, content UTF-8 350,000바이트 이하, status draft/published). 오류 문구도 지금과 같게(`"이미 있는 주소입니다"` 등 Next.js가 보여 주던 문구는 Next.js가 상태 코드로 매핑).
- 업로드 URL 규칙은 지금 `createImageUpload`와 같다(png/jpeg/gif/webp만, 10MB 이하, 키 `posts/{slug}/{uuid}.{ext}`, 5분, Content-Type·Content-Length 서명, 체크섬 파라미터 없음).
- DynamoDB 항목 형식은 지금과 같다(`pk = POST#slug`, 발행 글만 `gsi1pk = PUBLISHED`, `gsi1sk = date#slug`, `createdAt` 보존). 데이터 이전 없음.
- 응답 JSON에 `pk`·`gsi1*` 같은 내부 키를 넣지 않는다.

### Next.js 쪽

- `src/lib/posts/repo.ts`와 `src/lib/media/upload.ts`의 **공개 함수 이름·시그니처는 그대로** 두고, 안을 API 호출로 바꾼다(`listPublishedPosts`, `getPublishedPost`, `listAllPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`, `createImageUpload`, `PostExistsError`, `PostNotFoundError`). 페이지·Server Action은 손대지 않는다(관리자 함수에는 사용자 토큰 전달 경로만 추가).
- 새 `src/lib/api/client.ts`: `@aws-sdk/signature-v4` + 기본 자격 증명 체인(Amplify에서는 compute role)으로 `execute-api` 서명 후 `fetch`. 환경변수 `BLOG_API_URL`(끝 슬래시 없음). 타임아웃·오류 매핑(404 → null 또는 `PostNotFoundError`, 409 → `PostExistsError`, 5xx → 예외).
- 관리자 호출은 세션 쿠키의 ID 토큰을 `X-User-Token`으로 넘긴다.
- `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`는 앱 코드에서 제거(이전 스크립트가 쓰면 devDependencies로).
- Amplify 환경변수: `BLOG_API_URL` 추가, `BLOG_POSTS_TABLE`·`BLOG_MEDIA_BUCKET` 제거.

### Rust Lambda

- 위치: 저장소 `api/` (Cargo 프로젝트), 빌드 `cargo lambda build --release --arm64 --output-format zip`.
- 이름 `blog-prod-post-api-lambda`, 런타임 `provided.al2023`, arm64, 메모리 256MB, 타임아웃 10초, 로그 그룹 보존 14일.
- 환경변수: `TABLE_NAME`, `MEDIA_BUCKET`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`.
- 실행 역할 `blog-prod-post-api-role`: 테이블과 `index/*`에 `GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan`, 미디어 버킷 `posts/*`에 `PutObject`(presign용), 로그 쓰기.
- 라우팅·검증·JWT 확인·DynamoDB 매핑은 단위 테스트(`cargo test`).

### 인프라 (Terraform `infra/`)

- `aws_apigatewayv2_api`(HTTP) `blog-prod-post-api-apigw`, `ANY /{proxy+}` 라우트 `authorization_type = "AWS_IAM"`, Lambda 프록시 통합(payload 2.0), `$default` 스테이지 자동 배포, 접근 로그(선택).
- Lambda 권한: API Gateway가 이 Lambda만 호출.
- compute role 정책: DynamoDB·S3 문장 삭제, `execute-api:Invoke` on `arn:aws:execute-api:ap-northeast-2:910107943804:<api-id>/*/*/*`만.
- Amplify 앱 환경변수 갱신.

### CI

- `ci.yml`에 Rust job: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo lambda build --release --arm64`(빌드 확인만, 배포 없음). 이름 `Rust`.

### 전환 순서 (끊김 없이)

1. API·Lambda·Invoke 권한을 **추가만** 하는 apply(기존 compute role DynamoDB·S3 권한은 아직 유지).
2. Next.js를 API 호출로 바꾼 코드 + `BLOG_API_URL` 배포 → 운영에서 목록·상세·관리자 작성·수정·삭제·이미지 업로드 확인.
3. compute role의 DynamoDB·S3 권한과 옛 환경변수를 **제거**하는 apply → 다시 확인.
4. 문제가 생기면 2단계 이전 커밋으로 되돌리면 된다(1단계 상태에서는 옛 코드도 동작).

### 결정 보강 (검토 질문에 대한 답)

- **이전 스크립트·직접 접근 코드 삭제:** 기존 글 이전은 끝났다. `scripts/migrate-posts.ts`, `src/lib/posts/import.ts`(+테스트·`__fixtures__`), `putPost`, `src/lib/aws.ts`의 DynamoDB·S3 클라이언트, `posts/`, `public/images/posts/`, `scripts/check-images.mjs`(+CI 단계)를 이번에 함께 지운다(이전 계획의 Task 12 정리를 흡수). README도 새 구조로 다시 쓴다.
- **설정:** `getDataConfig()`는 `{ region, apiUrl }`(`BLOG_AWS_REGION`, `BLOG_API_URL`)로 바뀐다. 서명 리전은 `BLOG_AWS_REGION`. `BLOG_POSTS_TABLE`·`BLOG_MEDIA_BUCKET`는 앱에서 완전히 사라진다.
- **직접 접근 금지 강제:** ESLint `no-restricted-imports`로 `src/**`에서 `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` import를 금지(CI `Lint / Build`가 잡음). 해당 패키지는 package.json에서 제거.
- **사용자 토큰 전달:** 관리자 함수는 첫 인자로 토큰을 받는다 — `listAllPosts(token)`, `getPost(token, slug)`, `createPost(token, input)`, `updatePost(token, slug, input)`, `deletePost(token, slug)`, `createImageUpload(token, p)`. 공개 함수(`listPublishedPosts()`, `getPublishedPost(slug)`)는 그대로. 관리자 페이지·Server Action은 `src/lib/auth/session.ts`에 추가하는 `getSessionToken()`(검증된 세션의 ID 토큰 원문)으로 토큰을 얻는다. 시각(`createdAt`/`updatedAt`)은 Lambda가 찍고, Next.js 쪽 `now` 인자는 없앤다.
- **오류 계약:** 400 `{ errors }` → 검증 실패 결과, 409 → `PostExistsError`, 404 → `null`(조회) 또는 `PostNotFoundError`(수정), `DELETE` 없는 글 → 204, 401/403 → `UnauthorizedError`(지금 `requireAdmin` 실패와 같은 처리: 폼은 로그인 만료 배너, 페이지는 로그인으로), 5xx·네트워크 오류 → 예외. 클라이언트 타임아웃 8초, 재시도 없음.
- **JWT 검증 값:** `COGNITO_CLIENT_ID`는 Terraform이 `aws_cognito_user_pool_client.blog.id`를 Lambda 환경변수로 넣는다. Lambda는 VPC 밖(JWKS 인터넷 조회 가능). ID 토큰 12시간 유효는 지금 세션과 같으므로 그대로.
- **빌드·배포:** `api/`를 `cargo lambda build --release --arm64 --output-format zip`으로 빌드하는 `npm run build:api` 스크립트를 두고, Terraform은 `api/target/lambda/post-api/bootstrap.zip`(커밋하지 않음)을 `filename`·`source_code_hash`로 읽는다. apply 전에 반드시 `build:api`. 상태는 기존 S3 백엔드 그대로.
- **CI Rust job:** 모든 push·PR에서 실행(경로 필터 없음), 필수 검사 아님(main 보호 규칙 꺼져 있음). `dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache`, cargo-lambda는 `pip install cargo-lambda`(zig 포함).
- **성능:** 공개 페이지는 지금처럼 캐시 없음(동작 유지). Lambda 256MB, 프로비저닝 동시성 없음. 배포 후 첫 요청·평균 응답 시간을 재서 안티 목표를 넘으면 그때 캐시를 검토.
- **로그:** API Gateway 접근 로그는 켜지 않는다. Lambda는 메서드·경로·상태 코드·처리 시간만 남기고 헤더·본문·토큰은 절대 로그에 남기지 않는다.

## 제 판단으로 정한 것 (확인 필요)

- 인증 방식 B(IAM + Lambda 토큰 재검증). 사용자가 라우터 구조를 말했고 인증 방식은 따로 고르지 않음.
- 사용자 토큰 헤더 이름 `X-User-Token`.
- 공개 읽기 경로도 IAM 인증(외부 직접 호출 불가).
- Lambda 메모리 256MB·타임아웃 10초·로그 14일.
- Lambda 배포는 CI가 아니라 로컬 `terraform apply`(지금 인프라와 같은 방식).
- 이전 스크립트와 원본 md·이미지를 이번에 삭제(이전 끝남).
- 관리자 함수 첫 인자로 토큰 전달, 시각은 Lambda가 찍음.
- 공개 페이지 캐시 없음 유지, 접근 로그 없음.

## 구현자에게 맡기는 것

- Rust 크레이트 선택(예: `lambda_http`, `aws-sdk-dynamodb`, `aws-sdk-s3`, `jsonwebtoken`, `serde`), 라우터 구현 방식.
- API 클라이언트의 재시도·타임아웃 값(합리적 범위).
- 테스트 방식(경로별 단위 테스트, Next.js 쪽은 fetch·서명 목킹).
