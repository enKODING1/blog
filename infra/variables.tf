variable "cloudflare_zone_id" {
  description = "skang.dev Cloudflare 존 ID"
  type        = string
}

variable "site_domain" {
  description = "블로그 도메인 (끝 슬래시 없음)"
  type        = string
  default     = "blog.skang.dev"
}

variable "github_repository" {
  description = "Amplify 앱이 연결된 GitHub 저장소 (owner/name)"
  type        = string
  default     = "enKODING1/blog"
}
