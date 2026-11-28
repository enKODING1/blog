# 글 API: HTTP API(AWS_IAM) -> Rust 라우터 Lambda. Amplify compute role 만 Invoke 할 수 있다.
locals {
  post_api_name = "${local.name_prefix}-post-api"
  post_api_zip  = "${path.module}/../api/target/lambda/post-api/bootstrap.zip"
}

resource "aws_cloudwatch_log_group" "post_api" {
  name              = "/aws/lambda/${local.post_api_name}-lambda"
  retention_in_days = 14
}

data "aws_iam_policy_document" "post_api_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "post_api" {
  name               = "${local.post_api_name}-role"
  assume_role_policy = data.aws_iam_policy_document.post_api_assume.json
}

data "aws_iam_policy_document" "post_api" {
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

  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.post_api.arn}:*"]
  }
}

resource "aws_iam_role_policy" "post_api" {
  name   = "${local.post_api_name}-policy"
  role   = aws_iam_role.post_api.id
  policy = data.aws_iam_policy_document.post_api.json
}

resource "aws_lambda_function" "post_api" {
  function_name = "${local.post_api_name}-lambda"
  role          = aws_iam_role.post_api.arn
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 256
  timeout       = 10

  # zip 은 npm run build:api 로 만든다. CI(validate)에는 없으므로 없으면 해시를 비운다.
  filename         = local.post_api_zip
  source_code_hash = fileexists(local.post_api_zip) ? filebase64sha256(local.post_api_zip) : null

  environment {
    variables = {
      TABLE_NAME           = aws_dynamodb_table.posts.name
      MEDIA_BUCKET         = aws_s3_bucket.media.bucket
      COGNITO_USER_POOL_ID = local.user_pool_id
      COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.blog.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.post_api]
}

resource "aws_apigatewayv2_api" "post_api" {
  name          = "${local.post_api_name}-apigw"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "post_api" {
  api_id                 = aws_apigatewayv2_api.post_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.post_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_api" {
  api_id             = aws_apigatewayv2_api.post_api.id
  route_key          = "ANY /{proxy+}"
  authorization_type = "AWS_IAM"
  target             = "integrations/${aws_apigatewayv2_integration.post_api.id}"
}

# $default 스테이지: rawPath 에 스테이지 접두어가 붙지 않는다
resource "aws_apigatewayv2_stage" "post_api" {
  api_id      = aws_apigatewayv2_api.post_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "post_api" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.post_api.execution_arn}/*/*"
}
