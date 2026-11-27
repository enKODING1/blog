variable "site_domain" {
  description = "블로그 주소. skang.dev 는 범용 도메인이라 블로그는 서브도메인만 쓴다"
  type        = string
  default     = "blog.skang.dev"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare 대시보드 > skang.dev > Overview 오른쪽의 Zone ID (site_domain 이 속한 zone)"
  type        = string
}

variable "github_repository" {
  description = "배포 권한을 줄 GitHub 저장소 (owner/name)"
  type        = string
  default     = "enKODING1/blog"
}

variable "github_branch" {
  description = "배포를 허용할 브랜치"
  type        = string
  default     = "main"
}
