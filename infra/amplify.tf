# SSR 런타임이 DynamoDB·S3 에 접근할 때 쓰는 compute role
data "aws_iam_policy_document" "web_ssr_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["amplify.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "web_ssr" {
  name               = "${local.name_prefix}-web-ssr-role"
  assume_role_policy = data.aws_iam_policy_document.web_ssr_assume.json
}

data "aws_iam_policy_document" "web_ssr" {
  statement {
    sid    = "PostsTable"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      aws_dynamodb_table.posts.arn,
      "${aws_dynamodb_table.posts.arn}/index/*",
    ]
  }

  statement {
    sid       = "MediaUpload"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.media.arn}/posts/*"]
  }
}

resource "aws_iam_role_policy" "web_ssr" {
  name   = "${local.name_prefix}-web-ssr-policy"
  role   = aws_iam_role.web_ssr.id
  policy = data.aws_iam_policy_document.web_ssr.json
}

# 앱은 콘솔에서 GitHub App 으로 연결해 만든 뒤 import 한다.
# 저장소 연결·토큰·빌드 스펙(amplify.yml)은 콘솔/저장소가 관리하므로 무시한다.
resource "aws_amplify_app" "web" {
  name             = "${local.name_prefix}-web-site-amplify"
  repository       = "https://github.com/${var.github_repository}"
  platform         = "WEB_COMPUTE"
  compute_role_arn = aws_iam_role.web_ssr.arn

  # amplify.yml 이 BLOG_*/COGNITO_* 를 .env.production 으로 복사한다. 값에 끝 슬래시 없음.
  environment_variables = {
    BLOG_AWS_REGION      = local.region
    BLOG_POSTS_TABLE     = aws_dynamodb_table.posts.name
    BLOG_MEDIA_BUCKET    = aws_s3_bucket.media.bucket
    BLOG_SITE_URL        = "https://${var.site_domain}"
    COGNITO_USER_POOL_ID = local.user_pool_id
    COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.blog.id
    COGNITO_DOMAIN       = local.cognito_domain_url
  }

  # /media/* 는 미디어 버킷으로 프록시한다
  custom_rule {
    source = "/media/<*>"
    target = "https://${aws_s3_bucket.media.bucket}.s3.${local.region}.amazonaws.com/<*>"
    status = "200"
  }

  lifecycle {
    ignore_changes = [access_token, oauth_token, repository, build_spec]
  }
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.web.id
  branch_name       = "main"
  framework         = "Next.js - SSR"
  stage             = "PRODUCTION"
  enable_auto_build = true
}

# DNS 는 Cloudflare 에 있으므로 검증 레코드는 dns.tf 가 만든다
resource "aws_amplify_domain_association" "web" {
  app_id                 = aws_amplify_app.web.id
  domain_name            = "skang.dev"
  enable_auto_sub_domain = false
  wait_for_verification  = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "blog"
  }

  certificate_settings {
    type = "AMPLIFY_MANAGED"
  }
}
