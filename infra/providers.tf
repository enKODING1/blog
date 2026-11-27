locals {
  project     = "blog"
  environment = "prod"
  name_prefix = "${local.project}-${local.environment}"
  account_id  = "910107943804"

  default_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "terraform"
  }
}

# 이 프로젝트는 seongjin 프로필만 쓴다. 터미널의 AWS_PROFILE 과 무관하게 고정.
# allowed_account_ids 가 다른 계정이면 plan/apply 를 막는다.
provider "aws" {
  region              = "ap-northeast-2"
  profile             = "seongjin"
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = local.default_tags
  }
}

# CloudFront 용 ACM 인증서는 us-east-1 에만 만들 수 있다
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  profile             = "seongjin"
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = local.default_tags
  }
}

# 토큰은 CLOUDFLARE_API_TOKEN 환경 변수로 받는다
provider "cloudflare" {}
