# 글 본문과 메타데이터. pk 로 단건 조회, gsi1 로 목록 조회.
resource "aws_dynamodb_table" "posts" {
  name         = "${local.name_prefix}-post-content-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name               = "gsi1"
    projection_type    = "INCLUDE"
    non_key_attributes = ["slug", "title", "category", "date", "status", "createdAt", "updatedAt"]

    # GSI 의 hash_key/range_key 인자는 provider 6.x 에서 deprecated → key_schema 사용
    key_schema {
      attribute_name = "gsi1pk"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "gsi1sk"
      key_type       = "RANGE"
    }
  }

  point_in_time_recovery {
    enabled = true
  }
}
