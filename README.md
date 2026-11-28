# Personal Blog

`blog.skang.dev` 의 소스. 글은 DynamoDB, 이미지는 S3 에 두고, Next.js 는 API Gateway 를 거쳐서만 읽고 쓴다.

## 구조

```
브라우저 → Amplify(Next.js) → API Gateway(IAM) → Lambda(Rust) → DynamoDB / S3
```

- **Next.js** (`src/`): Amplify Hosting 에서 SSR 로 돈다. AWS 리소스는 `src/lib/api/client.ts` 가 SigV4 로 서명한 API 호출로만 쓴다. DynamoDB·S3 SDK 를 직접 import 하면 ESLint 가 막는다.
- **API Gateway**: HTTP API, 모든 경로가 IAM 인증. Amplify compute role 의 서명이 없으면 403.
- **Lambda** (`api/`): Rust 라우터 하나(`post-api`). 관리자 경로(`/admin/*`)는 `X-User-Token` 헤더의 Cognito ID 토큰을 다시 검증한다. 이미지 업로드는 S3 presigned PUT URL 을 내준다.
- **인증**: Cognito Managed Login. 로그인하면 ID 토큰이 `blog_id_token` 쿠키에 담기고, 관리자 페이지·Server Action 은 이 토큰을 API 에 넘긴다.
- **인프라** (`infra/`, `infra-shared/`): Terraform. AWS 계정은 `seongjin` 프로필(910107943804, `ap-northeast-2`)만 쓴다.

## 로컬 실행

`.env.local` 에 API 주소와 Cognito 값을 넣는다 (커밋하지 않는다).

```
BLOG_AWS_REGION=ap-northeast-2
BLOG_API_URL=https://<api-id>.execute-api.ap-northeast-2.amazonaws.com
BLOG_SITE_URL=http://localhost:3000
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
COGNITO_DOMAIN=https://...
```

API 서명에 쓸 자격 증명은 `seongjin` 프로필에서 가져온다.

```
npm ci
AWS_PROFILE=seongjin npm run dev
```

검사:

```
npm test && npm run lint && npm run format:check && npm run build && node scripts/check-build.mjs
```

테스트·빌드는 AWS 환경변수나 자격 증명 없이 돈다.

## API 빌드

[cargo-lambda](https://www.cargo-lambda.info/) 가 필요하다.

```
npm run build:api
```

결과물은 `api/target/lambda/post-api/bootstrap.zip` (커밋하지 않는다). Rust 테스트는 `cd api && cargo test`.

## 배포

- **웹**: `main` 에 push 하면 Amplify 가 빌드·배포한다.
- **인프라·Lambda**: `npm run build:api` 로 zip 을 만든 뒤 `infra/` 에서 `terraform apply`. Lambda 코드는 CI 가 아니라 이 apply 로 올라간다.
