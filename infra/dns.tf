# Amplify 가 돌려주는 "이름 CNAME 값" 문자열을 Cloudflare 레코드로 만든다.
# skang.dev 의 루트·www·다른 서브도메인은 건드리지 않는다.
# 만들 수 있는 레코드는 blog.skang.dev 와 그 인증서 검증 CNAME(_로 시작) 두 개뿐이다.
locals {
  zone_name = "skang.dev"

  cert_record_parts = split(" ", trimspace(aws_amplify_domain_association.web.certificate_verification_dns_record))
  site_record_parts = split(" ", trimspace(one(aws_amplify_domain_association.web.sub_domain[*].dns_record)))

  # 끝의 . 을 떼고, 존 이름이 빠진 상대 이름이면 존 이름을 붙여 FQDN 으로 맞춘다
  cert_record_name_raw = trimsuffix(local.cert_record_parts[0], ".")
  cert_record_name     = endswith(local.cert_record_name_raw, local.zone_name) ? local.cert_record_name_raw : "${local.cert_record_name_raw}.${local.zone_name}"
  cert_record_type     = local.cert_record_parts[1]
  cert_record_value    = trimsuffix(local.cert_record_parts[2], ".")

  site_record_name_raw = trimsuffix(local.site_record_parts[0], ".")
  site_record_name     = endswith(local.site_record_name_raw, local.zone_name) ? local.site_record_name_raw : "${local.site_record_name_raw}.${local.zone_name}"
  site_record_type     = local.site_record_parts[1]
  site_record_value    = trimsuffix(local.site_record_parts[2], ".")
}

resource "cloudflare_dns_record" "amplify_cert_verification" {
  zone_id = var.cloudflare_zone_id
  name    = local.cert_record_name
  type    = local.cert_record_type
  content = local.cert_record_value
  ttl     = 1
  proxied = false
  comment = "Amplify 인증서 검증 (${var.site_domain}, terraform)"

  lifecycle {
    precondition {
      condition = (
        length(local.cert_record_parts) == 3 &&
        local.cert_record_type == "CNAME" &&
        can(regex("^_[a-z0-9]+\\.(blog\\.)?skang\\.dev$", local.cert_record_name))
      )
      error_message = "인증서 검증 레코드가 _<hash>.skang.dev 또는 _<hash>.blog.skang.dev CNAME 이 아니다: ${local.cert_record_name} ${local.cert_record_type}"
    }
  }
}

resource "cloudflare_dns_record" "site" {
  zone_id = var.cloudflare_zone_id
  name    = local.site_record_name
  type    = local.site_record_type
  content = local.site_record_value
  ttl     = 1
  proxied = false
  comment = "블로그 Amplify 호스팅 (terraform)"

  lifecycle {
    precondition {
      condition = (
        length(local.site_record_parts) == 3 &&
        local.site_record_type == "CNAME" &&
        local.site_record_name == var.site_domain
      )
      error_message = "사이트 레코드가 ${var.site_domain} CNAME 이 아니다: ${local.site_record_name} ${local.site_record_type}"
    }
  }
}
