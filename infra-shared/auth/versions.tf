terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # 계정 공용 상태 버킷을 키만 분리해서 사용한다.
  # 블로그(infra/)와 상태를 분리해, 블로그를 destroy 해도 공용 풀이 지워지지 않게 한다.
  backend "s3" {
    bucket       = "ddobagi-shared-tfstate-bucket-910107943804"
    key          = "skangdev/prod/auth/terraform.tfstate"
    region       = "ap-northeast-2"
    profile      = "seongjin"
    encrypt      = true
    use_lockfile = true
  }
}
