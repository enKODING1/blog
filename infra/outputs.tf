output "posts_table" {
  description = "글 DynamoDB 테이블 이름"
  value       = aws_dynamodb_table.posts.name
}

output "media_bucket" {
  description = "글 미디어 S3 버킷 이름"
  value       = aws_s3_bucket.media.bucket
}

output "amplify_app_id" {
  description = "Amplify 앱 ID"
  value       = aws_amplify_app.web.id
}

output "amplify_default_domain" {
  description = "Amplify 기본 도메인"
  value       = aws_amplify_app.web.default_domain
}

output "cognito_client_id" {
  description = "블로그 Cognito 앱 클라이언트 ID"
  value       = aws_cognito_user_pool_client.blog.id
}

output "api_url" {
  description = "글 API(HTTP API) 엔드포인트. 끝 슬래시 없음"
  value       = aws_apigatewayv2_api.post_api.api_endpoint
}
