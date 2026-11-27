# CLAUDE.md

## AWS: `seongjin` 프로필만 사용

이 프로젝트의 모든 AWS 작업은 **`seongjin` 프로필(계정 `910107943804`, `ap-northeast-2`)** 로만 한다.

- 이 PC 의 `default` 프로필(계정 `528757797682`)은 다른 계정이다. 절대 쓰지 않는다.
- AWS 명령·Terraform·AWS MCP 를 쓰기 전에 `sts get-caller-identity` 로 계정이 `910107943804` 인지 확인한다. 다르면 실행하지 말고 사용자에게 알린다.
- AWS CLI 는 항상 `--profile seongjin` 또는 `AWS_PROFILE=seongjin` 으로 실행한다.
- `seongjin` 은 `aws login` 세션이라 자주 만료된다. `Your session has expired` 가 나오면 사용자에게 `aws login --profile seongjin` 을 요청한다.
- Terraform(`infra/`)은 backend 와 provider 에 `profile = "seongjin"` 과 `allowed_account_ids` 가 고정되어 있다. 지우지 않는다.

## 인프라 규칙

- 리전은 서울(`ap-northeast-2`). 단 CloudFront 용 ACM 인증서는 AWS 제약상 `us-east-1` 에만 만들 수 있어 예외다 (`aws.us_east_1` provider). 이것을 서울로 "고치지" 않는다.
- 블로그는 `dev` 없이 `prod` 하나만 둔다.
- 리소스 이름: `blog-prod-{도메인}-{기능}-{리소스종류}` (S3 버킷은 끝에 계정 ID).
- 태그: `Project=blog`, `Environment=prod`, `ManagedBy=terraform`.
- 블로그 주소는 `blog.skang.dev`. `skang.dev` 는 범용 도메인(Cloudflare)이라 루트·`www`·다른 서브도메인은 이 프로젝트가 건드리지 않는다.
