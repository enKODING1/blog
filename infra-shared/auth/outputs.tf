output "user_pool_id" {
  description = "공용 Cognito 사용자 풀 ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "공용 Cognito 사용자 풀 ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "domain_url" {
  description = "Cognito 호스티드 UI 도메인 URL (끝 슬래시 없음)"
  value       = local.domain_url
}
