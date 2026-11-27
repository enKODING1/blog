# skang.dev 하위 프로젝트들이 함께 쓰는 Cognito 사용자 풀.
# 각 프로젝트는 SSM 파라미터로 풀을 읽고, 자기 앱 클라이언트와 그룹을 직접 만든다.
resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-userpool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"
  deletion_protection      = "ACTIVE"

  # 생성 후 바꿀 수 없다. 이메일 대소문자가 달라도 같은 사용자로 본다.
  username_configuration {
    case_sensitive = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # required 는 풀 생성 후 바꿀 수 없다. 다른 커스텀 속성은 추가하지 않는다.
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "skangdev-auth"
  user_pool_id = aws_cognito_user_pool.main.id

  # 클래식 화면. v2 는 클라이언트별 브랜딩 리소스가 필요하다.
  managed_login_version = 1
}

locals {
  domain_url = "https://${aws_cognito_user_pool_domain.main.domain}.auth.ap-northeast-2.amazoncognito.com"
}

resource "aws_ssm_parameter" "user_pool_id" {
  name  = "/${local.project}/${local.environment}/auth/user-pool-id"
  type  = "String"
  value = aws_cognito_user_pool.main.id
}

resource "aws_ssm_parameter" "user_pool_arn" {
  name  = "/${local.project}/${local.environment}/auth/user-pool-arn"
  type  = "String"
  value = aws_cognito_user_pool.main.arn
}

resource "aws_ssm_parameter" "domain_url" {
  name  = "/${local.project}/${local.environment}/auth/domain-url"
  type  = "String"
  value = local.domain_url
}
