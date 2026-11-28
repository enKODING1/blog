# 블로그 재구성 (Next.js 15.5 + DynamoDB + Amplify) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 정적 블로그를 버리고, DynamoDB에서 글을 읽어 동적으로 렌더링하고 `/admin`에서 로그인해 글을 쓰는 미니멀 Next.js 블로그를 Amplify Hosting(`blog.skang.dev`)에 올린다.

**Architecture:** Next.js App Router 앱 하나를 Amplify `WEB_COMPUTE`로 배포한다. 공개 페이지는 요청마다 DynamoDB에서 읽는다(`force-dynamic`). 쓰기는 Server Actions가 `blog-admin` 그룹 검증 후 DynamoDB/S3에 한다. 인증은 공용 Cognito 풀(별도 Terraform 스택)의 Managed Login + authorization code(PKCE)다. 인프라는 Terraform, Amplify 앱만 콘솔에서 GitHub 연결 후 import 한다.

**Tech Stack:** Next.js 15.5.29, React 19.3.1, Tailwind CSS 4 + @tailwindcss/typography, unified/remark/rehype, AWS SDK v3 (DynamoDB DocumentClient, S3 presigner), aws-jwt-verify, Vitest + aws-sdk-client-mock, Terraform (aws ~> 6, cloudflare ~> 5), Node.js 22.

**Spec:** `docs/superpowers/specs/2026-11-27-dynamodb-posts-design.md`

**작업 위치:** 작업 트리 `/Users/skang/workspace/blog-dynamodb`, 브랜치 `feat/dynamodb-posts` (origin/main 1723e4d 기준). `/Users/skang/workspace/blog`는 다른 세션과 공유하므로 쓰지 않는다.

## Global Constraints

- AWS 계정 `910107943804`, 프로필 `seongjin`, 리전 `ap-northeast-2`. AWS 명령 전 `aws sts get-caller-identity --profile seongjin`으로 계정 확인. 다르면 멈추고 사용자에게 알림. 세션 만료 시 사용자에게 `aws login --profile seongjin` 요청.
- Terraform backend·provider에 `profile = "seongjin"`, `allowed_account_ids = ["910107943804"]` 고정. 상태 버킷 `ddobagi-shared-tfstate-bucket-910107943804`.
- 블로그 리소스 이름 `blog-prod-{도메인}-{기능}-{리소스종류}`, S3 버킷 끝에 계정 ID. 태그 `Project=blog`, `Environment=prod`, `ManagedBy=terraform`.
- 공용 인증 리소스는 `skangdev-prod-auth-*`, 태그 `Project=skangdev`, 상태 키 `skangdev/prod/auth/terraform.tfstate`.
- 블로그 주소 `blog.skang.dev`. `skang.dev`의 루트·www·다른 서브도메인은 건드리지 않는다. Cloudflare 레코드는 DNS only(`proxied = false`).
- Next.js `15.5.29` 고정 (Amplify 공식 SSR 지원은 Next 12–15; 16은 미지원). `output: "export"` 없음.
- Node.js 22 (CI, Amplify 빌드 모두). Node 20은 2026-04 EOL.
- 직접 작성하는 Lambda 없음 (CLAUDE.md의 Rust 규칙과 무관하게 유지).
- 글 경로 `/posts/{slug}` 유지. slug 형식 `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 생성 후 변경 불가.
- UI는 새로 시작. 남기는 것은 Google Analytics `G-SQB18PDDPD`뿐. 댓글 없음.
- 마크다운 렌더링: remark-gfm, remark-breaks, remark-rehype(`allowDangerousHtml: true`), rehype-raw, rehype-highlight, rehype-stringify (기존 `lib/posts.ts`와 동일 구성).
- main은 PR 필수, 필수 검사 `Lint / Build`, `Secret scan`. 커밋·푸시·PR은 사용자 확인 후.
- 코드 스타일: 기존 `.prettierrc` (세미콜론, 큰따옴표, `arrowParens: avoid`).

## Review Focus

1. **AWS 환경변수 없이 빌드** — CI(`Lint / Build`)에는 AWS 설정이 없다. 환경변수를 모듈 최상단에서 읽으면 빌드가 깨진다. → Task 2 `config` 테스트 + Task 4 빌드 검증.
2. **초안 글 주소로 직접 접근** — `/posts/{초안slug}`는 404여야 한다. → Task 3 `getPublishedPost` 테스트.
3. **로그인 없이 Server Action 직접 호출** — 미들웨어를 우회한 POST도 거부돼야 한다. → Task 6 액션 테스트.
4. **이미 있는 slug로 새 글 생성** — 기존 글을 덮어쓰지 않고 오류를 보여야 한다. → Task 3 `createPost` 테스트.
5. **만료·위조된 ID 토큰 쿠키** — 500이 아니라 로그아웃 상태로 취급(로그인으로 보냄). → Task 5 `getAdminSession` 테스트.

---

## File Structure

```
amplify.yml                         Amplify 빌드 스펙 (env → .env.production, .next 산출물)
next.config.ts                      export 제거
postcss.config.mjs                  @tailwindcss/postcss
vitest.config.ts
src/middleware.ts                   /admin/* 쿠키 없으면 로그인으로
src/app/layout.tsx                  루트 레이아웃 + GA
src/app/globals.css                 Tailwind 4 + typography
src/app/page.tsx                    발행 글 목록
src/app/not-found.tsx
src/app/posts/[slug]/page.tsx       글 상세
src/app/admin/layout.tsx            requireAdmin
src/app/admin/page.tsx              전체 글 목록(초안 포함)
src/app/admin/new/page.tsx
src/app/admin/[slug]/edit/page.tsx
src/app/admin/actions.ts            savePost, removePost, previewMarkdown, requestImageUpload
src/app/admin/PostForm.tsx          클라이언트 작성 폼 (미리보기, 이미지 붙여넣기)
src/app/api/auth/login/route.ts
src/app/api/auth/callback/route.ts
src/app/api/auth/logout/route.ts
src/lib/config.ts                   환경변수 지연 로드
src/lib/aws.ts                      DynamoDB DocumentClient, S3Client 싱글턴
src/lib/markdown.ts                 renderMarkdown
src/lib/posts/types.ts              Post, PostInput, PostSummary
src/lib/posts/validate.ts           validatePostInput
src/lib/posts/repo.ts               DynamoDB CRUD
src/lib/posts/import.ts             md 파일 → PostInput 변환 (이전 스크립트용)
src/lib/auth/pkce.ts
src/lib/auth/cognito.ts             authorize URL, code 교환
src/lib/auth/session.ts             getAdminSession, requireAdmin, 쿠키 이름
src/lib/media/upload.ts             presigned PUT 생성
scripts/migrate-posts.ts            기존 글 6개 이전
scripts/check-build.mjs             SSR 빌드 산출물 검사로 교체
infra-shared/auth/*.tf              공용 Cognito 풀
infra/*.tf                          블로그 리소스 (DynamoDB, S3, Cognito 클라이언트, Amplify, DNS)
.github/workflows/ci.yml            test, Terraform 검사 추가, Node 22
```

삭제: `src/app/components/**`, `src/app/utils/**`, `src/app/template.tsx`, `src/app/fonts/**`, `lib/`, `tailwind.config.ts`, `CNAME`, `public/*.svg`. `posts/`, `public/images/posts/`, `scripts/check-images.mjs`는 Task 12(이전 확인 후)에서 삭제.

---

### Task 1: 새 앱 뼈대 (기존 UI 제거, Next 15.5, Tailwind 4, GA, Vitest, CI)

**Files:**

- Delete: 위 "삭제" 목록 중 Task 1 대상
- Modify: `package.json`, `next.config.ts`, `postcss.config.mjs`, `.github/workflows/ci.yml`, `scripts/check-build.mjs`, `README.md`
- Create: `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`(임시 "준비 중"), `src/app/not-found.tsx`, `amplify.yml`

**Interfaces:**

- Produces: `npm test` (vitest run), `npm run build`이 `.next/` 생성. 경로 별칭 `@/*` → `src/*` 유지.

- [ ] **Step 1: 의존성 정리.** 제거: `gsap`, `gh-pages`, `remark-html`, `tailwindcss@3`, `postcss` 직접 의존. 추가(정확한 버전): `next@15.5.29`, `react@19.3.1`, `react-dom@19.3.1`, `@next/third-parties@15.5.29`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `aws-jwt-verify@5`. dev: `tailwindcss@4`, `@tailwindcss/postcss@4`, `@tailwindcss/typography@0.5`, `vitest@4`, `aws-sdk-client-mock@4`, `tsx@4`, `gray-matter`(이전 스크립트용). 기존 unified/remark/rehype 패키지 유지. 스크립트: `predeploy`/`deploy` 제거, `"test": "vitest run"` 추가. PR #3의 `overrides`는 유지.
- [ ] **Step 2: 설정.** `next.config.ts`에서 `output`, `basePath` 제거(빈 config). `postcss.config.mjs`는 `@tailwindcss/postcss`만. `globals.css`는 `@import "tailwindcss"; @plugin "@tailwindcss/typography";` + 최소 body 스타일. `vitest.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`, `@` 별칭.
- [ ] **Step 3: 레이아웃.** `layout.tsx`: `<html lang="ko">`, 시스템 폰트, `max-w-2xl mx-auto px-4` 단일 컬럼, 상단에 블로그 이름 링크(`/`) 한 줄, `<GoogleAnalytics gaId="G-SQB18PDDPD" />`(`@next/third-parties/google`). highlight.js 스타일시트 링크 2개(github / github-dark, prefers-color-scheme)는 기존과 같이 유지. 애니메이션은 나중에 `children`을 클라이언트 래퍼로 감쌀 수 있도록 레이아웃에 다른 로직을 넣지 않는다.
- [ ] **Step 4: `amplify.yml` 작성.**

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm use 22
        - npm ci
    build:
      commands:
        - env | grep -E '^(BLOG_|COGNITO_)' >> .env.production
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - "**/*"
  cache:
    paths:
      - .next/cache/**/*
      - node_modules/**/*
```

- [ ] **Step 5: `scripts/check-build.mjs` 교체.** `.next/BUILD_ID`, `.next/required-server-files.json` 존재, `.next/app-path-routes-manifest.json`의 값에 `/`, `/posts/[slug]`, `/admin` 포함 여부 검사(이 Task에서는 `/`만 존재하므로 검사 목록을 상수 배열로 두고 Task 4·6에서 항목 추가). 실패 시 `::error::` 출력 후 exit 1.
- [ ] **Step 6: CI.** `ci.yml`의 `node-version`을 22로, `npm run build` 앞에 `- run: npm test` 추가. `check-images.mjs` 단계는 유지.
- [ ] **Step 7: 확인.** Run: `npm ci && npm run lint && npm run format:check && npm test -- --passWithNoTests && npm run build && node scripts/check-build.mjs` — Expected: 모두 성공.
- [ ] **Step 8: Commit** `chore: 기존 정적 UI 제거, Next 15.5·Tailwind 4 뼈대`

---

### Task 2: 설정·AWS 클라이언트·마크다운 렌더링

**Files:**

- Create: `src/lib/config.ts`, `src/lib/aws.ts`, `src/lib/markdown.ts`
- Test: `src/lib/config.test.ts`, `src/lib/markdown.test.ts`

**Interfaces:**

- Produces:
  - `type AppConfig = { region: string; postsTable: string; mediaBucket: string; siteUrl: string; cognito: { userPoolId: string; clientId: string; domain: string } }`
  - `getConfig(): AppConfig` — 환경변수 `BLOG_AWS_REGION`, `BLOG_POSTS_TABLE`, `BLOG_MEDIA_BUCKET`, `BLOG_SITE_URL`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`(`https://` 포함 전체 URL). 없으면 `Error("Missing env: NAME")`. 결과 메모이즈.
  - `getDdb(): DynamoDBDocumentClient`, `getS3(): S3Client` — 첫 호출 시 생성. 자격 증명은 SDK 기본 체인(로컬은 `AWS_PROFILE=seongjin`, Amplify는 compute role).
  - `renderMarkdown(md: string): Promise<string>`

- [ ] **Step 1: 실패하는 테스트 작성.**
  - `config.test.ts`: `import("@/lib/config")`가 환경변수 없이도 throw 하지 않는다. `getConfig()`는 `BLOG_POSTS_TABLE` 없으면 `/Missing env: BLOG_POSTS_TABLE/` throw. 모두 있으면 `cognito.domain === "https://x.auth.ap-northeast-2.amazoncognito.com"` 등 값 매핑 확인.
  - `markdown.test.ts`: `| a | b |\n|---|---|\n| 1 | 2 |` → `<table>` 포함. `"줄1\n줄2"` → `<br>` 포함. `'<div class="x">hi</div>'` → `<div class="x">hi</div>` 그대로. ` ```c\nint main(){}\n``` ` → `class="hljs language-c"` 포함. `posts/fixed.md` 본문(gray-matter로 frontmatter 제거) 렌더 결과에 `<h2>` 포함.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL (모듈 없음).
- [ ] **Step 3: 구현.** `markdown.ts`는 Global Constraints의 파이프라인 그대로 `unified()` 사용(기존 `remark()` 대신 `unified().use(remarkParse)`도 무방, 결과 동일해야 함).
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: 설정 로더, AWS 클라이언트, 마크다운 렌더러`

---

### Task 3: 글 저장소 (DynamoDB)

**Files:**

- Create: `src/lib/posts/types.ts`, `src/lib/posts/validate.ts`, `src/lib/posts/repo.ts`
- Test: `src/lib/posts/validate.test.ts`, `src/lib/posts/repo.test.ts` (aws-sdk-client-mock)

**Interfaces:**

- Consumes: `getDdb()`, `getConfig().postsTable`
- Produces:
  - `type PostStatus = "draft" | "published"`
  - `type PostInput = { slug: string; title: string; category: string; date: string; content: string; status: PostStatus }`
  - `type Post = PostInput & { createdAt: string; updatedAt: string }`
  - `type PostSummary = Omit<Post, "content">`
  - `validatePostInput(input: unknown): { ok: true; value: PostInput } | { ok: false; errors: Record<string, string> }`
  - `class PostExistsError extends Error`, `class PostNotFoundError extends Error`
  - `listPublishedPosts(): Promise<PostSummary[]>` — GSI `gsi1`, `gsi1pk = "PUBLISHED"`, `ScanIndexForward: false`, 페이지네이션 끝까지
  - `listAllPosts(): Promise<PostSummary[]>` — Scan, `content` 제외 projection, `date` 내림차순 정렬
  - `getPost(slug: string): Promise<Post | null>`
  - `getPublishedPost(slug: string): Promise<Post | null>` — 초안이면 null
  - `createPost(input: PostInput, now?: Date): Promise<Post>` — `ConditionExpression: "attribute_not_exists(pk)"`, 실패 시 `PostExistsError`
  - `updatePost(slug: string, input: Omit<PostInput, "slug">, now?: Date): Promise<Post>` — `attribute_exists(pk)` 조건, `createdAt` 보존, 발행이면 `gsi1pk/gsi1sk` SET, 초안이면 REMOVE. 없으면 `PostNotFoundError`
  - `deletePost(slug: string): Promise<void>`
  - `putPost(post: Post): Promise<void>` — 조건 없는 덮어쓰기 (이전 스크립트 전용)
- 항목 키: `pk = "POST#" + slug`, `gsi1pk = "PUBLISHED"`(발행만), `gsi1sk = date + "#" + slug`. GSI projection은 Task 10에서 `INCLUDE [slug, title, category, date, status, createdAt, updatedAt]`.

- [ ] **Step 1: 실패하는 테스트 작성.**
  - validate: 기존 slug 6개(`42-piscine`, `browser-rendering`, `fixed`, `minishell`, `nand2tetris`, `naval-sw-developer`) 통과. `"Hello"`, `"a--b"`, `"한글"`, `"-a"` 거부. `date: "2025-13-01"` 거부, `"2025-12-01"` 통과. 빈 title/category 거부. `content` UTF-8 350,000바이트 초과 거부. `status: "hidden"` 거부.
  - repo: `createPost` 발행 → PutCommand 항목에 `gsi1pk: "PUBLISHED"`, `gsi1sk: "2025-12-01#browser-rendering"`, `createdAt === updatedAt === now.toISOString()`. 초안 → `gsi1pk` 없음. `ConditionalCheckFailedException` → `PostExistsError`(Review Focus 4). `updatePost` 발행→초안 → UpdateExpression에 `REMOVE gsi1pk, gsi1sk`. 없는 slug → `PostNotFoundError`. `getPublishedPost` 초안 항목이면 null(Review Focus 2). `listPublishedPosts`는 `LastEvaluatedKey` 두 페이지를 합친다. 반환 객체에 `pk`, `gsi1pk`, `gsi1sk` 없음.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: DynamoDB 글 저장소와 입력 검증`

---

### Task 4: 공개 페이지 (목록, 상세)

**Files:**

- Modify: `src/app/page.tsx`, `scripts/check-build.mjs`(`/posts/[slug]` 추가)
- Create: `src/app/posts/[slug]/page.tsx`

**Interfaces:**

- Consumes: `listPublishedPosts`, `getPublishedPost`, `renderMarkdown`

- [ ] **Step 1: 목록.** `export const dynamic = "force-dynamic"`. 글마다 날짜·카테고리·제목 한 줄, `/posts/{slug}` 링크. 글이 없으면 "아직 글이 없습니다."
- [ ] **Step 2: 상세.** `force-dynamic`, `generateStaticParams` 없음. `getPublishedPost`가 null이면 `notFound()`. 제목, 날짜, 카테고리, `<article className="prose dark:prose-invert">`에 `renderMarkdown` 결과. `generateMetadata`로 `title` 설정(같은 요청에서 두 번 읽지 않게 `react`의 `cache()`로 `getPublishedPost` 감싸기).
- [ ] **Step 3: 확인.** Run: `npm run build && node scripts/check-build.mjs` (환경변수 없음) — Expected: 성공, 빌드 로그에 `/`와 `/posts/[slug]`가 `ƒ (Dynamic)`로 표시 (Review Focus 1).
- [ ] **Step 4: Commit** `feat: 공개 글 목록·상세 페이지 (동적 렌더링)`

---

### Task 5: 인증 (Cognito Managed Login, PKCE, 세션)

**Files:**

- Create: `src/lib/auth/pkce.ts`, `src/lib/auth/cognito.ts`, `src/lib/auth/session.ts`, `src/app/api/auth/{login,callback,logout}/route.ts`, `src/middleware.ts`
- Test: `src/lib/auth/pkce.test.ts`, `src/lib/auth/cognito.test.ts`, `src/lib/auth/session.test.ts`, `src/app/api/auth/callback/route.test.ts`

결정: **public client + PKCE**(client secret 없음). 스펙의 "confidential client + SSM 비밀값"을 바꾼 것 — 서버에서 code를 교환하므로 PKCE로 충분하고, 런타임 SSM 조회와 compute role 자격 증명 문제(Next 16 보고 사례)를 피한다. 리프레시 토큰은 쓰지 않는다: ID 토큰 유효기간 12시간, 만료되면 다시 로그인.

**Interfaces:**

- Consumes: `getConfig()`
- Produces:
  - 쿠키 상수: `SESSION_COOKIE = "blog_id_token"`(HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 43200), `OAUTH_COOKIE = "blog_oauth"`(HttpOnly, Secure, SameSite=Lax, Path=/api/auth, Max-Age 600, 값 `{state, verifier, next}` JSON)
  - `createPkce(): { verifier: string; challenge: string }` (S256, base64url), `createState(): string`
  - `buildAuthorizeUrl(p: { state: string; challenge: string }): string` — `${domain}/oauth2/authorize?response_type=code&client_id=…&redirect_uri=${siteUrl}/api/auth/callback&scope=openid+email&state=…&code_challenge=…&code_challenge_method=S256`
  - `exchangeCode(code: string, verifier: string): Promise<{ idToken: string }>` — `POST ${domain}/oauth2/token`, `grant_type=authorization_code`, form-urlencoded. 실패 시 throw
  - `type AdminSession = { email: string; sub: string }`
  - `getAdminSession(): Promise<AdminSession | null>` — `cookies()`에서 토큰 읽고 `CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id", groups: "blog-admin" })`로 검증. 없음·만료·위조·그룹 없음 → null
  - `class UnauthorizedError extends Error`; `requireAdmin(): Promise<AdminSession>` — null이면 `UnauthorizedError`
  - `/api/auth/login?next=/admin` → OAUTH 쿠키 설정 후 authorize URL로 302. `next`는 `/`로 시작하고 `//`로 시작하지 않을 때만 허용, 아니면 `/admin`
  - `/api/auth/callback` → state 불일치·쿠키 없음이면 400. 성공 시 SESSION 쿠키 설정, OAUTH 쿠키 삭제, `next`로 302
  - `/api/auth/logout` → SESSION 삭제 후 `${domain}/logout?client_id=…&logout_uri=${siteUrl}/`로 302
  - `middleware.ts` matcher `/admin/:path*`: SESSION 쿠키 없으면 `/api/auth/login?next=<경로>`로 리다이렉트 (검증은 하지 않음 — 실제 검증은 `requireAdmin`)

- [ ] **Step 1: 실패하는 테스트 작성.**
  - pkce: `challenge === base64url(sha256(verifier))`, verifier 길이 43–128.
  - cognito: authorize URL 쿼리 파라미터 값 확인. `exchangeCode`는 `fetch` mock으로 body에 `code_verifier` 포함, 400 응답이면 throw.
  - session (`vi.mock("next/headers")`, `vi.mock("aws-jwt-verify")`): 쿠키 없음 → null. verifier가 throw(만료·위조) → null, throw 하지 않음(Review Focus 5). 검증 성공 → `{ email, sub }`. `requireAdmin`은 null일 때 `UnauthorizedError`.
  - callback route: state 불일치 → 400, `exchangeCode` 호출 안 함. 정상 → 302 + `Set-Cookie`에 `blog_id_token=` 및 `HttpOnly`.
  - login route: `next=https://evil.com` → OAUTH 쿠키의 next가 `/admin`.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Cognito 로그인(PKCE)과 관리자 세션`

---

### Task 6: 관리자 화면과 Server Actions

**Files:**

- Create: `src/app/admin/layout.tsx`, `page.tsx`, `new/page.tsx`, `[slug]/edit/page.tsx`, `actions.ts`, `PostForm.tsx`
- Modify: `scripts/check-build.mjs`(`/admin` 추가)
- Test: `src/app/admin/actions.test.ts`

**Interfaces:**

- Consumes: `requireAdmin`, `UnauthorizedError`, `validatePostInput`, `createPost`, `updatePost`, `deletePost`, `listAllPosts`, `getPost`, `PostExistsError`, `renderMarkdown`
- Produces (`actions.ts`, `"use server"`):
  - `type ActionResult = { ok: true; slug: string } | { ok: false; errors: Record<string, string> }`
  - `savePost(mode: "create" | "update", input: PostInput): Promise<ActionResult>` — `requireAdmin()` 먼저. 검증 실패·`PostExistsError`(`errors.slug = "이미 있는 주소입니다"`)는 `ok: false`. 성공 시 `revalidatePath("/")`, `revalidatePath("/posts/" + slug)`
  - `removePost(slug: string): Promise<void>` — `requireAdmin()` 후 삭제, `/admin`으로 `redirect`
  - `previewMarkdown(md: string): Promise<string>` — `requireAdmin()` 후 `renderMarkdown`
  - `requestImageUpload(slug, contentType, size)` — Task 7에서 추가

- [ ] **Step 1: 실패하는 테스트 작성** (`vi.mock("@/lib/auth/session")`, `vi.mock("@/lib/posts/repo")`, `vi.mock("next/cache")`): `requireAdmin`이 `UnauthorizedError`를 던지면 `savePost`·`removePost`·`previewMarkdown` 모두 reject 되고 repo 함수는 호출되지 않는다(Review Focus 3). `createPost`가 `PostExistsError`를 던지면 `{ ok: false, errors: { slug: "이미 있는 주소입니다" } }`. 잘못된 slug는 repo 호출 없이 `ok: false`.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3: 구현.**
  - `admin/layout.tsx`: `getAdminSession()`이 null이면 `redirect("/api/auth/login?next=/admin")`. 상단에 "새 글", "로그아웃"(`/api/auth/logout`) 링크.
  - `admin/page.tsx`: `listAllPosts()` 표 — 날짜, 제목, 상태, 편집 링크.
  - `PostForm.tsx`(`"use client"`): 필드 title, slug(수정 모드에서 `readOnly`), date(기본 오늘), category, status(초안/발행), content textarea. "미리보기" 버튼이 `previewMarkdown` 결과를 `prose` 영역에 표시. 저장 시 `savePost`, `errors`를 필드 아래 표시, 성공 시 `/admin`으로 이동. 수정 모드에 "삭제" 버튼(`window.confirm` 사용 가능).
  - `new/page.tsx`, `[slug]/edit/page.tsx`(`getPost` null이면 `notFound()`).
- [ ] **Step 4:** Run `npm test && npm run build && node scripts/check-build.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: 관리자 글 목록·작성·수정·삭제`

---

### Task 7: 이미지 업로드

**Files:**

- Create: `src/lib/media/upload.ts`
- Modify: `src/app/admin/actions.ts`, `src/app/admin/PostForm.tsx`
- Test: `src/lib/media/upload.test.ts`, `src/app/admin/actions.test.ts`

**Interfaces:**

- Consumes: `getS3()`, `getConfig().mediaBucket`, `requireAdmin`
- Produces:
  - `ALLOWED_IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }`, `MAX_IMAGE_BYTES = 10 * 1024 * 1024`
  - `createImageUpload(p: { slug: string; contentType: string; size: number }): Promise<{ uploadUrl: string; markdownPath: string }>` — 키 `posts/{slug}/{randomUUID()}.{ext}`, `PutObjectCommand({ Bucket, Key, ContentType, ContentLength: size })`, `expiresIn: 300`. `markdownPath = "/media/" + key`. 잘못된 slug·타입·크기는 `Error`
  - 액션 `requestImageUpload(slug: string, contentType: string, size: number)` — `requireAdmin()` 후 `createImageUpload`

- [ ] **Step 1: 실패하는 테스트 작성.** `image/svg+xml` 거부(스크립트 실행 위험), 10MB+1 거부, slug `"../x"` 거부. 정상 시 `markdownPath`가 `/^\/media\/posts\/fixed\/[0-9a-f-]{36}\.png$/`. 액션은 비로그인 시 reject.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3: 구현.** `PostForm`: textarea에 이미지 붙여넣기·드롭 시 파일마다 `requestImageUpload` → `fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })` → 커서 위치에 `![파일명](markdownPath)` 삽입. 실패 시 폼 상단에 오류 표시.
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: 관리자 이미지 업로드 (S3 presigned PUT)`

---

### Task 8: 기존 글 이전 스크립트

**Files:**

- Create: `src/lib/posts/import.ts`, `scripts/migrate-posts.ts`
- Test: `src/lib/posts/import.test.ts`

**Interfaces:**

- Consumes: `validatePostInput`, `putPost`, `getS3()`, `getConfig()`
- Produces:
  - `parseLegacyPost(fileName: string, raw: string): { post: Post; images: string[] }` — slug = 파일명에서 `.md` 제거. frontmatter의 `title`, `date`, `category`. `status: "published"`. 본문의 `/images/posts/` → `/media/posts/` 치환. `images`는 본문이 참조한 `/images/posts/...` 경로 목록(중복 제거). `createdAt = updatedAt = date + "T00:00:00.000Z"`. 검증 실패 시 throw.
  - 실행: `AWS_PROFILE=seongjin BLOG_AWS_REGION=ap-northeast-2 BLOG_POSTS_TABLE=… BLOG_MEDIA_BUCKET=… npx tsx scripts/migrate-posts.ts [--dry-run]` — `posts/*.md`마다 이미지 `public/images/posts/<slug>/<file>`를 S3 키 `posts/<slug>/<file>`로 업로드(ContentType 확장자로), 그다음 `putPost`. `--dry-run`은 계획만 출력. 다시 돌려도 같은 결과(덮어쓰기).
  - 스크립트는 `getConfig()` 대신 필요한 두 변수만 읽어도 된다 (Cognito 변수 불필요).

- [ ] **Step 1: 실패하는 테스트 작성.** 실제 `posts/browser-rendering.md`를 읽어 `parseLegacyPost` → `post.slug === "browser-rendering"`, `title === "브라우저가 렌더링 하는 과정"`, `date === "2025-12-01"`, `category === "WEB"`, 본문에 `/images/posts/` 없음, `/media/posts/browser-rendering/dom.png` 포함, `images.length === 6`. `posts/fixed.md` → `images` 1개(`/images/posts/fixed/float_size.png`). 6개 파일 모두 throw 없이 파싱.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** Run `npm test` — Expected: PASS. Run `npx tsx scripts/migrate-posts.ts --dry-run`(환경변수는 가짜 값) — Expected: 글 6개, 이미지 7개 계획 출력, AWS 호출 없음.
- [ ] **Step 5: Commit** `feat: 기존 md 글을 DynamoDB/S3로 옮기는 스크립트`

---

### Task 9: 공용 인증 Terraform (`infra-shared/auth/`)

**Files:**

- Create: `infra-shared/auth/versions.tf`, `providers.tf`, `main.tf`, `outputs.tf`
- Modify: `.gitignore` (`infra-shared/**/.terraform/`, tfstate, tfvars — 기존 `infra/` 규칙과 같게)

**Interfaces:**

- Produces (SSM String 파라미터): `/skangdev/prod/auth/user-pool-id`, `/skangdev/prod/auth/user-pool-arn`, `/skangdev/prod/auth/domain-url`(`https://skangdev-auth.auth.ap-northeast-2.amazoncognito.com`)

- [ ] **Step 1: 작성.** versions/providers는 PR #2 커밋 `22f47a7`의 `infra/versions.tf`, `infra/providers.tf`를 `git show 22f47a7:infra/versions.tf`로 가져와 수정: backend key `skangdev/prod/auth/terraform.tfstate`, cloudflare provider·us_east_1 provider 제거, locals `project = "skangdev"`.
      `main.tf`:
  - `aws_cognito_user_pool` `skangdev-prod-auth-userpool`: `username_attributes = ["email"]`, `auto_verified_attributes = ["email"]`, `admin_create_user_config { allow_admin_create_user_only = true }`, `mfa_configuration = "OPTIONAL"` + `software_token_mfa_configuration { enabled = true }`, 비밀번호 최소 12자, `deletion_protection = "ACTIVE"`, `account_recovery_setting` 이메일.
  - `aws_cognito_user_pool_domain` `domain = "skangdev-auth"`, `managed_login_version = 1` (클래식 화면 — v2는 클라이언트별 브랜딩 리소스가 필요해서).
  - SSM 파라미터 3개.
- [ ] **Step 2: 검증.** Run: `cd infra-shared/auth && terraform fmt -check && terraform init -backend=false && terraform validate` — Expected: `Success! The configuration is valid.`
- [ ] **Step 3: Commit** `feat(infra): skang.dev 공용 Cognito 사용자 풀`

---

### Task 10: 블로그 Terraform (`infra/`)

**Files:**

- Create: `infra/versions.tf`, `providers.tf`, `variables.tf`, `dynamodb.tf`, `media.tf`, `auth.tf`, `amplify.tf`, `dns.tf`, `outputs.tf`, `terraform.tfvars.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: Task 9의 SSM 파라미터(`data "aws_ssm_parameter"`)
- Produces: Amplify 앱 환경변수(= Task 2 `getConfig`의 변수 전부), outputs `posts_table`, `media_bucket`, `amplify_app_id`, `amplify_default_domain`, `cognito_client_id`

- [ ] **Step 1: 기본.** `versions.tf`·`providers.tf`는 `22f47a7`에서 가져오고 us_east_1 provider 제거(backend key `blog/prod/terraform.tfstate` 그대로). `variables.tf`: `cloudflare_zone_id`(필수), `site_domain = "blog.skang.dev"`, `github_repository = "enKODING1/blog"`.
- [ ] **Step 2: `dynamodb.tf`.** `blog-prod-post-content-table`: `billing_mode = "PAY_PER_REQUEST"`, `hash_key = "pk"`, GSI `gsi1`(hash `gsi1pk`, range `gsi1sk`, `projection_type = "INCLUDE"`, `non_key_attributes = ["slug","title","category","date","status","createdAt","updatedAt"]`), `point_in_time_recovery { enabled = true }`, `deletion_protection_enabled = true`.
- [ ] **Step 3: `media.tf`.** `blog-prod-post-media-bucket-910107943804`: SSE AES256, ownership `BucketOwnerEnforced`, public access block에서 `block_public_policy = false`·`restrict_public_buckets = false`만 풀고 ACL 차단은 유지. 버킷 정책: `s3:GetObject` `Principal "*"`, 리소스 `${arn}/posts/*`만. CORS: `PUT` from `https://blog.skang.dev`, `http://localhost:3000`, 헤더 `Content-Type`.
- [ ] **Step 4: `auth.tf`.** `aws_cognito_user_group` `blog-admin`(풀 ID는 SSM). `aws_cognito_user_pool_client` `blog-prod-auth-userpool-client`: `generate_secret = false`, `allowed_oauth_flows = ["code"]`, `allowed_oauth_flows_user_pool_client = true`, `allowed_oauth_scopes = ["openid","email"]`, `supported_identity_providers = ["COGNITO"]`, `callback_urls = ["https://blog.skang.dev/api/auth/callback","http://localhost:3000/api/auth/callback"]`, `logout_urls = ["https://blog.skang.dev/","http://localhost:3000/"]`, `id_token_validity = 12`, `access_token_validity = 12`, `refresh_token_validity = 1`(단위 hours/hours/days), `prevent_user_existence_errors = "ENABLED"`.
- [ ] **Step 5: `amplify.tf`.**
  - compute role `blog-prod-web-ssr-role`: trust `amplify.amazonaws.com`(조건 `aws:SourceAccount = 910107943804`). 정책: 테이블과 `index/*`에 `GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan`; 미디어 버킷 `posts/*`에 `PutObject`.
  - `aws_amplify_app.web`(콘솔에서 만든 앱을 import — Task 11): `name = "blog-prod-web-site-amplify"`, `platform = "WEB_COMPUTE"`, `compute_role_arn`, `environment_variables` = `BLOG_AWS_REGION`, `BLOG_POSTS_TABLE`, `BLOG_MEDIA_BUCKET`, `BLOG_SITE_URL = "https://blog.skang.dev"`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`. `custom_rule { source = "/media/<*>", target = "https://${bucket}.s3.ap-northeast-2.amazonaws.com/<*>", status = "200" }`. `lifecycle { ignore_changes = [access_token, oauth_token, repository, build_spec] }`.
  - `aws_amplify_branch.main`: `branch_name = "main"`, `framework = "Next.js - SSR"`, `stage = "PRODUCTION"`, `enable_auto_build = true`.
  - `aws_amplify_domain_association`: `domain_name = "skang.dev"`, `sub_domain { branch_name = "main", prefix = "blog" }`, `enable_auto_sub_domain = false`, `wait_for_verification = false`, `certificate_settings { type = "AMPLIFY_MANAGED" }`.
- [ ] **Step 6: `dns.tf`.** `certificate_verification_dns_record`("이름 CNAME 값" 문자열)와 `sub_domain[*].dns_record`를 `split(" ", …)`로 나눠 `cloudflare_dns_record` 2개(`proxied = false`, `ttl = 1`, 끝의 `.` 제거). 이름이 `blog.skang.dev`와 그 인증서 검증 레코드 외의 것이면 `precondition`으로 실패시킨다(skang.dev 다른 레코드 보호).
- [ ] **Step 7: CI.** `ci.yml`에 job `terraform`(이름 `Terraform`): `hashicorp/setup-terraform@v3`, `terraform fmt -check -recursive`, 각 디렉터리(`infra`, `infra-shared/auth`) `terraform init -backend=false && terraform validate`.
- [ ] **Step 8: 검증.** Run: `terraform fmt -check -recursive && (cd infra && terraform init -backend=false && terraform validate)` — Expected: valid.
- [ ] **Step 9: Commit** `feat(infra): 블로그 DynamoDB·S3·Cognito 클라이언트·Amplify`

---

### Task 11: 배포·이전·도메인 연결 (사용자와 함께)

AWS·GitHub·Cloudflare를 실제로 바꾸는 단계. 각 하위 단계 전에 사용자에게 알리고 진행한다.

- [ ] **Step 1: PR.** Task 1–10을 PR로 올리고 `Lint / Build`, `Secret scan`, `Terraform` 통과 확인 후 사용자 머지. (main 머지는 GitHub Pages 운영 사이트에 영향 없음 — gh-pages 배포는 수동이었음.)
- [ ] **Step 2: 필수 검사 추가.** 사용자 확인 후 `gh api`로 main 보호 규칙 필수 검사에 `Terraform` 추가.
- [ ] **Step 3: 계정 확인.** `aws sts get-caller-identity --profile seongjin` — Expected: `"Account": "910107943804"`.
- [ ] **Step 4: 공용 인증 apply.** `cd infra-shared/auth && terraform init && terraform plan` → 사용자 확인 → `apply`.
- [ ] **Step 5: Amplify 앱 생성 (사용자, 콘솔).** 서울 리전, GitHub App으로 `enKODING1/blog` `main` 연결, 앱 이름 `blog-prod-web-site-amplify`. 첫 빌드는 환경변수가 없어 실패해도 된다. 앱 ID를 받는다.
- [ ] **Step 6: import + apply.** `cd infra && terraform init`, `terraform import aws_amplify_app.web <appId>`, `terraform import aws_amplify_branch.main <appId>/main`, `TF_VAR_cloudflare_zone_id=… terraform plan` → 사용자 확인 → `apply` (CLOUDFLARE_API_TOKEN 필요).
- [ ] **Step 7: 관리자 계정.** `aws cognito-idp admin-create-user --user-pool-id <id> --username <사용자 이메일> --profile seongjin` → `admin-add-user-to-group --group-name blog-admin`. 임시 비밀번호는 이메일로 감.
- [ ] **Step 8: 글 이전.** `--dry-run` 후 실제 실행. 확인: `aws dynamodb scan --table-name blog-prod-post-content-table --select COUNT --profile seongjin` → `"Count": 6`; `aws s3 ls s3://blog-prod-post-media-bucket-910107943804/posts/ --recursive` → 7개.
- [ ] **Step 9: 재빌드.** `aws amplify start-job --app-id <id> --branch-name main --job-type RELEASE --profile seongjin` → 성공 확인.
- [ ] **Step 10: 기본 도메인 확인.** `https://main.<default_domain>`에서 글 6개 목록, 각 상세, 이미지(`/media/posts/...`) 200, 없는 slug 404.
- [ ] **Step 11: 도메인.** `aws amplify get-domain-association --app-id <id> --domain-name skang.dev` → `domainStatus: AVAILABLE`까지 대기. `https://blog.skang.dev` 접속.
- [ ] **Step 12: 관리자 흐름 확인 (blog.skang.dev).** 로그인(첫 로그인 비밀번호 변경) → 초안 글 생성 → 공개 목록에 없고 `/posts/<slug>` 404 → 발행 → 목록·상세에 즉시 표시 → 이미지 붙여넣기 업로드 후 표시 → 삭제 → 404. 로그아웃 후 `/admin` → 로그인 화면.

---

### Task 12: 정리

**Files:**

- Delete: `posts/`, `public/images/posts/`, `scripts/check-images.mjs`
- Modify: `.github/workflows/ci.yml`(check-images 단계 제거), `README.md`(로컬 실행: `.env.local` 변수 목록, `AWS_PROFILE=seongjin npm run dev`, 배포는 main push → Amplify)

- [ ] **Step 1:** Task 11 Step 8·10 확인이 끝났는지 다시 본다 (안티 목표: 확인 전 삭제 금지).
- [ ] **Step 2:** 삭제·수정. Run `npm test && npm run build && node scripts/check-build.mjs` — Expected: 성공.
- [ ] **Step 3: Commit + PR** `chore: md 원본과 이미지 검사 제거 (DynamoDB/S3로 이전 완료)`

---

## 스펙과 다르게 정한 것 (사용자 확인용)

- 공개 페이지 캐싱: ISR 대신 `force-dynamic`(요청마다 DynamoDB 조회). 빌드 때 DB 접근이 필요 없고, 발행 즉시 반영이 보장된다. 개인 블로그 트래픽에서 비용 차이는 사실상 없다. 스펙의 대체안을 처음부터 택한 것.
- Cognito 앱 클라이언트: confidential client + SSM 비밀값 대신 public client + PKCE. 리프레시 토큰 없이 12시간 세션.
- Next.js 16 대신 15.5.29 (Amplify 공식 지원 범위).
- Managed Login 클래식 화면(v1).
