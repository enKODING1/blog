output "site_url" {
  value = "https://${var.site_domain}"
}

output "s3_bucket" {
  description = "GitHub 저장소 변수 S3_BUCKET"
  value       = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  description = "GitHub 저장소 변수 CLOUDFRONT_DISTRIBUTION_ID"
  value       = aws_cloudfront_distribution.web.id
}

output "deploy_role_arn" {
  description = "GitHub 저장소 변수 AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.deploy.arn
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.web.domain_name
}
