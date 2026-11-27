# ---------------------------------------------------------------------------
# S3: Next.js 정적 빌드(out/)를 올리는 비공개 버킷. CloudFront(OAC)만 읽을 수 있다.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "web" {
  bucket = "${local.name_prefix}-web-bucket-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

# ---------------------------------------------------------------------------
# ACM: blog.skang.dev 인증서. 검증 레코드는 Cloudflare 에 만든다.
# skang.dev 루트와 다른 서브도메인은 이 스택이 건드리지 않는다.
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "web" {
  provider = aws.us_east_1

  domain_name       = var.site_domain
  validation_method = "DNS"

  tags = {
    Name = "${local.name_prefix}-web-cert"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "acm_validation" {
  for_each = {
    for o in aws_acm_certificate.web.domain_validation_options : o.domain_name => o
  }

  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = 1
  proxied = false
  comment = "ACM validation for ${each.key} (terraform: ${local.name_prefix})"
}

resource "aws_acm_certificate_validation" "web" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.web.arn
  validation_record_fqdns = [for r in aws_acm_certificate.web.domain_validation_options : trimsuffix(r.resource_record_name, ".")]

  depends_on = [cloudflare_dns_record.acm_validation]
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name_prefix}-web-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# /posts/foo → /posts/foo.html, /dir/ → /dir/index.html 변환
resource "aws_cloudfront_function" "rewrite" {
  name    = "${local.name_prefix}-web-rewrite-function"
  runtime = "cloudfront-js-2.0"
  comment = "Next.js static export path rewrite"
  publish = true
  code    = file("${path.module}/functions/rewrite.js")
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  comment             = "${local.name_prefix}-web-cdn"
  aliases             = [var.site_domain]
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_200"

  origin {
    origin_id                = "s3-web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite.arn
    }
  }

  # OAC 는 ListBucket 권한이 없어 없는 파일에 403 을 돌려준다 → 404 페이지로 바꾼다
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ---------------------------------------------------------------------------
# Cloudflare DNS: blog.skang.dev → CloudFront. 회색 구름(DNS only)이어야 한다.
# ---------------------------------------------------------------------------
resource "cloudflare_dns_record" "web" {
  zone_id = var.cloudflare_zone_id
  name    = var.site_domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.web.domain_name
  ttl     = 1
  proxied = false
  comment = "CloudFront ${local.name_prefix}-web-cdn (terraform)"
}
