terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # 계정 공용 상태 버킷을 키만 분리해서 사용한다 (ddobagi 는 envs/dev/ 사용)
  backend "s3" {
    bucket       = "ddobagi-shared-tfstate-bucket-910107943804"
    key          = "blog/prod/terraform.tfstate"
    region       = "ap-northeast-2"
    profile      = "seongjin"
    encrypt      = true
    use_lockfile = true
  }
}
