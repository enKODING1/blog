# 공용 Cognito 풀(infra-shared/auth)은 SSM 파라미터로 읽는다
data "aws_ssm_parameter" "user_pool_id" {
  name = "/skangdev/prod/auth/user-pool-id"
}

data "aws_ssm_parameter" "user_pool_arn" {
  name = "/skangdev/prod/auth/user-pool-arn"
}

data "aws_ssm_parameter" "cognito_domain_url" {
  name = "/skangdev/prod/auth/domain-url"
}

locals {
  user_pool_id       = data.aws_ssm_parameter.user_pool_id.value
  cognito_domain_url = data.aws_ssm_parameter.cognito_domain_url.value
}

resource "aws_cognito_user_group" "admin" {
  name         = "blog-admin"
  user_pool_id = local.user_pool_id
  description  = "블로그 관리자 (글 작성·수정)"
}

resource "aws_cognito_user_pool_client" "blog" {
  name         = "${local.name_prefix}-auth-userpool-client"
  user_pool_id = local.user_pool_id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = [
    "https://${var.site_domain}/api/auth/callback",
    "http://localhost:3000/api/auth/callback",
  ]
  logout_urls = [
    "https://${var.site_domain}/",
    "http://localhost:3000/",
  ]

  id_token_validity      = 12
  access_token_validity  = 12
  refresh_token_validity = 1

  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}
