# 글 이미지. posts/* 만 공개 읽기, 업로드는 서버가 발급한 presigned PUT 으로만.
resource "aws_s3_bucket" "media" {
  bucket = "${local.name_prefix}-post-media-bucket-${local.account_id}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# ACL 차단은 유지하고, 버킷 정책으로 posts/* 공개 읽기만 허용한다
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "media_public_read" {
  statement {
    sid       = "PublicReadPosts"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/posts/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_public_read.json

  # 공개 정책은 public access block 이 풀린 뒤에 붙여야 한다
  depends_on = [aws_s3_bucket_public_access_block.media]
}

# 브라우저가 presigned URL 로 직접 PUT 한다
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["https://${var.site_domain}", "http://localhost:3000"]
    allowed_headers = ["Content-Type"]
    max_age_seconds = 3000
  }
}
