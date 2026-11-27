# 블로그 글 DynamoDB 이전 + 관리자 작성 화면 설계

작성일: 2026-11-27

## 의도

블로그 주소는 `blog.skang.dev`다. `skang.dev`는 범용 도메인(Cloudflare)이라 이 프로젝트는 루트·www·다른 서브도메인을 건드리지 않는다. 현재 운영 중인 사이트는 GitHub Pages(www.enkoding.net)뿐이다. PR #2(브랜치 `infra/aws-blog-prod`)에 S3 + CloudFront 정적 호스팅 구성이 있으나 apply 전이다.

지금은 `posts/*.md`를 빌드 시점에 읽어 Next.js 정적 export(`output: "export"`)로 만든다. 글을 쓰려면 저장소에 md 파일을 커밋하고 push 해야 한다.

목표는 **블로그 안에서 로그인해서 글을 쓰고 고치는 것**이다. 글은 DynamoDB에 저장한다. 사이트는 정적일 필요가 없다. 전부 AWS 서버리스 / 관리형으로 구성하고, 호스팅은 **AWS Amplify Hosting**을 쓴다.

## 목표

- `/admin`에서 로그인 후 글 작성 / 수정 / 삭제 / 발행.
- 글 본문·메타데이터는 DynamoDB, 이미지는 S3.
- 발행·수정 즉시(수 초 내) 공개 페이지에 반영. 재빌드 없음.
- 기존 글 6개와 이미지를 그대로 옮기고 경로(`/posts/{slug}`)를 유지한다. Utterances 댓글이 `issue-term=pathname`이라 경로가 바뀌면 댓글이 끊긴다.
- Cognito 사용자 풀은 skang.dev의 다른 프로젝트도 쓸 수 있는 **공용 풀**로 만든다.

## 비목표

- 여러 작성자, 댓글 시스템 교체, 검색, 태그 체계 개편, 예약 발행.
- 다른 프로젝트의 Cognito 앱 클라이언트 (풀만 공용으로 준비).
- GitHub Pages(www.enkoding.net)에서의 이전·리다이렉트.
- dev 환경 (prod만 존재).

## 안티 목표 (동작해도 실패인 것)

- 로그인만 하면 누구나 글을 쓸 수 있는 상태. → 반드시 `blog-admin` 그룹 검사.
- 블로그 Terraform을 destroy/재생성할 때 공용 사용자 풀이 같이 사라지는 구조.
- 기존 글 경로가 바뀌어 댓글·외부 링크가 깨지는 것.
- 방문자 없어도 큰 고정 비용이 나가는 구성.
- 기존 글 렌더링 결과(GFM 표, 줄바꿈, raw HTML, 코드 하이라이트)가 달라지는 것.

## 제약

- AWS 계정 910107943804, 프로필 `seongjin`, 리전 ap-northeast-2.
- 리소스 이름 `blog-prod-{domain}-{function}-{type}`, 태그 Project=blog / Environment=prod / ManagedBy=terraform. S3 버킷은 계정 ID 접미사.
- IaC는 Terraform. 상태는 `ddobagi-shared-tfstate-bucket-910107943804`를 키로 분리.
- DNS는 Cloudflare (DNS only).
- CI / 브랜치 규칙 (PR #4 `ci/pr-checks`): main은 PR 필수, 필수 검사 `Lint / Build`와 `Secret scan`(strict, 관리자 포함). 머지 순서는 PR #4 → PR #3 → 이 작업.
  - `scripts/check-build.mjs`는 정적 export(`out/`)를 전제로 한다. 정적 export를 없애므로 이 검사와 `ci.yml`의 해당 단계를 Amplify/SSR 빌드(`.next/`)에 맞게 바꿔야 `Lint / Build`가 통과한다.
  - `infra/`·`infra-shared/`를 추가하면 `ci.yml`에 `terraform fmt -check` / `validate` job을 넣고 main 보호 규칙의 필수 검사에도 추가한다.
  - Terraform 뼈대(provider, backend, 태그 규칙)는 닫힌 PR #2의 커밋 `22f47a7`에서 가져온다. 상태 키 `blog/prod/terraform.tfstate`는 비어 있어 그대로 이어 쓴다.
- CLAUDE.md: Lambda는 Rust. → Amplify 구성에서는 직접 작성하는 Lambda가 없다. 나중에 별도 Lambda가 필요해지면 Rust로 쓴다.

## 접근 방식

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **Amplify Hosting (선택)** | 저장소 연결, Amplify가 빌드·SSR·CDN·인증서 담당 | 가장 손이 덜 감, 직접 만드는 Lambda 없음(Rust 규칙과 충돌 없음) | 내부 구성 제어 제한, PR #2의 S3/CloudFront 구성 대부분 불필요 |
| OpenNext + 직접 구성 | CloudFront/Lambda/S3를 Terraform으로 전부 관리 | 완전한 제어, PR #2 재사용 | 부품 많음, Node Lambda라 Rust 규칙 예외 필요 |
| Lambda Web Adapter + standalone | Lambda 하나로 Next 서버 실행 | 단순, PR #2 재사용 | ISR·이미지 최적화 직접 챙김, Rust 규칙 예외 필요 |
| 정적 유지 + Rust API + 발행 시 재빌드 | | Rust 규칙 그대로 | 반영 지연, 앱 이원화 |
| ECS Fargate 등 상시 컨테이너 | | 단순 | 상시 비용 → 제외 |

사용자가 Amplify Hosting을 선택했다.

## 결정된 사항 (사용자 결정)

- 저장소: DynamoDB.
- 작성 방식: 블로그 내 로그인 후 작성 화면.
- 사이트: 동적 렌더링 허용, AWS 서버리스.
- 호스팅: AWS Amplify Hosting.
- 인증: Cognito, 사용자 풀은 skang.dev 공용. 이름 `skangdev-prod-auth-userpool`, 스택 `infra-shared/auth/`, Cognito 기본 도메인.
- PR #2는 닫는다. Terraform 뼈대(provider, backend, 태그 규칙)만 이 작업 브랜치로 가져와 Amplify 구성으로 새로 짠다.
- 작성자: 본인 한 명.

## 설계

### 1. 공용 인증 (별도 Terraform 스택)

- 위치: `infra-shared/auth/` (블로그 `infra/`와 별도 state).
- 사용자 풀: `skangdev-prod-auth-userpool`.
  - 셀프 가입 비활성 (`allow_admin_create_user_only = true`). 관리자 계정은 CLI로 생성.
  - 로그인 ID는 이메일. MFA는 선택적 TOTP.
- 로그인 화면 도메인: Cognito 기본 도메인(`{prefix}.auth.ap-northeast-2.amazoncognito.com`). skang.dev DNS는 건드리지 않는다. (사용자 결정)
- 출력값(풀 ID/ARN/도메인)은 SSM 파라미터로 내보내고 블로그 스택이 읽는다.
- 그룹 `blog-admin`과 앱 클라이언트는 블로그 스택에서 만든다.

### 2. 호스팅 (Amplify)

- Terraform: `aws_amplify_app`(플랫폼 `WEB_COMPUTE`), `aws_amplify_branch`(main, 자동 빌드), `aws_amplify_domain_association`(blog.skang.dev) + Cloudflare 검증/CNAME 레코드.
- GitHub 연결은 Amplify GitHub App 또는 액세스 토큰 — 구현자 판단(토큰이면 tfvars/환경변수로, 상태에 남는 점 유의).
- SSR 런타임 권한: Amplify **compute role**(IAM)에 글 테이블 읽기/쓰기, 미디어 버킷 PutObject(presign용), SSM 파라미터 읽기 권한.
- 비밀값(Cognito client secret): SSM SecureString, 런타임에 compute role로 조회.
- 기존 GitHub Actions 배포 워크플로는 Amplify 자동 빌드로 대체.
- Next.js / React는 Amplify가 지원하는 안정 버전으로 맞춘다 (PR #3의 next 15.5 / react 19 업데이트 기반). `output: "export"` 제거.

### 3. 블로그 앱 (Next.js)

- 앱 클라이언트 `blog-prod-auth-userpool-client`: confidential client(client secret), authorization code 흐름을 서버에서 교환. 콜백 `https://blog.skang.dev/api/auth/callback`, 로그아웃 `https://blog.skang.dev/`.
- 세션: ID/리프레시 토큰을 HttpOnly·Secure·SameSite=Lax 쿠키로 저장. 서버 코드에서 JWKS 서명 검증 + `cognito:groups`에 `blog-admin` 확인.
- 라우트:
  - `/` 글 목록 (발행된 글만, 날짜 내림차순)
  - `/posts/[slug]` 글 상세 (경로 유지)
  - `/admin`, `/admin/new`, `/admin/[slug]/edit`
  - `/api/auth/login|callback|logout`
  - 쓰기는 Server Actions (관리자 검증 → DynamoDB → `revalidatePath`).
  - 이미지 업로드: 서버가 presigned PUT URL 발급 → 브라우저가 S3에 직접 업로드.
- 캐싱: 공개 페이지는 on-demand ISR, 발행·수정·삭제 시 `revalidatePath("/")`, `revalidatePath("/posts/{slug}")`. Amplify에서 on-demand revalidate가 기대대로 동작하는지 구현 초기에 확인하고, 안 되면 동적 렌더링 + 짧은 캐시로 대체.
- 마크다운: 기존 `lib/posts.ts`의 remark/rehype 파이프라인 재사용, 원문 저장.
- 작성 화면: 제목, slug, 날짜, 카테고리, 본문(textarea + 같은 파이프라인 미리보기), 상태(초안/발행), 이미지 드래그·붙여넣기 업로드 시 마크다운 이미지 문법 자동 삽입.

### 4. 데이터 (DynamoDB)

테이블 `blog-prod-post-content-table`, 온디맨드, PITR 켬, 삭제 보호 켬.

| 속성 | 설명 |
|---|---|
| `pk` (PK) | `POST#{slug}` |
| `slug` | 경로, 생성 후 변경 불가 |
| `title`, `category`, `date`(YYYY-MM-DD) | 기존 frontmatter |
| `content` | 마크다운 원문 |
| `status` | `draft` / `published` |
| `createdAt`, `updatedAt` | ISO 시각 |
| `gsi1pk` | 발행 글만 `PUBLISHED` |
| `gsi1sk` | `{date}#{slug}` |

- GSI `gsi1`: 공개 목록 Query(내림차순). 관리자 목록은 Scan.

### 5. 이미지 (S3)

- 버킷 `blog-prod-post-media-bucket-910107943804`. 키 `posts/{slug}/{uuid}.{ext}`.
- 서빙: Amplify 리라이트 규칙으로 `/media/<*>` → S3 객체 URL 프록시(200 rewrite). 이를 위해 버킷은 `posts/*` 읽기만 공개(쓰기·목록 비공개). — 제 판단. 공개 읽기를 피하려면 별도 CloudFront가 필요하고 서브도메인이 하나 더 생긴다.
- 업로드는 presigned PUT(콘텐츠 타입·크기 제한).
- 기존 `public/images/posts/**`는 이 버킷으로 옮기고 본문 경로를 `/media/posts/...`로 치환.

### 6. 기존 글 이전

- 일회성 스크립트 `scripts/migrate-posts.ts`: `posts/*.md` 파싱 → 이미지 경로 치환 → DynamoDB PutItem(`status=published`) + 이미지 S3 업로드. 멱등.
- 확인 후 `posts/`, `public/images/posts/` 삭제.

### 7. 전환 순서

1. 공용 인증 스택 배포 → 관리자 계정 생성.
2. 블로그 스택(테이블, 미디어 버킷, compute role, Amplify 앱, 그룹·앱 클라이언트) 배포.
3. 이전 스크립트 실행, 검증.
4. Amplify 기본 도메인(`*.amplifyapp.com`)에서 글 6개 경로·렌더링·로그인·작성 확인.
5. blog.skang.dev 연결.
6. `posts/` 정리.

## 제 판단으로 정한 것 (사용자 확인 필요)

- 셀프 가입 비활성, 블로그 쓰기 권한은 `blog-admin` 그룹 검사.
- MFA: 선택적 TOTP.
- 글 상태(초안/발행) 도입.
- slug는 생성 후 변경 불가.
- 이미지 `/media/...` 경로, 미디어 버킷 `posts/*` 공개 읽기 + Amplify 리라이트.
- 마크다운 원문 저장 + 기존 렌더링 파이프라인 재사용.

## 구현자에게 맡기는 것

- Next / React 정확한 버전(Amplify 지원 범위 내).
- Amplify GitHub 연결 방식.
- 인증 라이브러리(`aws-jwt-verify` 등).
- 작성 화면 UI 세부(기존 Tailwind 스타일).
- 테스트 전략.

## 열린 질문

없음.
