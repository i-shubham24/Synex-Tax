# S3 Vault Module: Primary vault in ap-south-1 (Mumbai) with Cross-Region Replication (CRR)
# to ap-south-2 (Hyderabad) for 100% India residency and MCA Rule 3(6) 8-year compliance.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.primary, aws.dr]
    }
  }
}

# Primary S3 Bucket in Mumbai (ap-south-1)
resource "aws_s3_bucket" "primary_vault" {
  provider      = aws.primary
  bucket        = "${var.environment}-syntax-mca-vault-${var.aws_account_id}-mumbai"
  force_destroy = var.environment == "staging" ? true : false

  tags = {
    Name        = "${var.environment}-syntax-mca-vault"
    Environment = var.environment
    Compliance  = "MCA-Rule-3-6-Primary-Storage"
    Region      = "ap-south-1"
  }
}

resource "aws_s3_bucket_versioning" "primary" {
  provider = aws.primary
  bucket   = aws_s3_bucket.primary_vault.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "primary" {
  provider = aws.primary
  bucket   = aws_s3_bucket.primary_vault.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "primary" {
  provider = aws.primary
  bucket   = aws_s3_bucket.primary_vault.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DR S3 Bucket in Hyderabad (ap-south-2)
resource "aws_s3_bucket" "dr_vault" {
  provider      = aws.dr
  bucket        = "${var.environment}-syntax-mca-vault-${var.aws_account_id}-hyderabad"
  force_destroy = var.environment == "staging" ? true : false

  tags = {
    Name        = "${var.environment}-syntax-dr-vault"
    Environment = var.environment
    Compliance  = "MCA-Rule-3-6-Warm-DR-Storage"
    Region      = "ap-south-2"
  }
}

resource "aws_s3_bucket_versioning" "dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.dr_vault.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "dr" {
  provider = aws.dr
  bucket   = aws_s3_bucket.dr_vault.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM Role for S3 Cross-Region Replication
resource "aws_iam_role" "replication" {
  provider = aws.primary
  name     = "${var.environment}-syntax-s3-replication-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "replication" {
  provider = aws.primary
  name     = "${var.environment}-syntax-s3-replication-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Effect   = "Allow"
        Resource = [aws_s3_bucket.primary_vault.arn]
      },
      {
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Effect   = "Allow"
        Resource = ["${aws_s3_bucket.primary_vault.arn}/*"]
      },
      {
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Effect   = "Allow"
        Resource = ["${aws_s3_bucket.dr_vault.arn}/*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "replication" {
  provider   = aws.primary
  role       = aws_iam_role.replication.name
  policy_arn = aws_iam_policy.replication.arn
}

resource "aws_s3_bucket_replication_configuration" "replication" {
  provider   = aws.primary
  depends_on = [aws_s3_bucket_versioning.primary]

  role   = aws_iam_role.replication.arn
  bucket = aws_s3_bucket.primary_vault.id

  rule {
    id     = "ReplicateAllToHyderabad"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.dr_vault.arn
      storage_class = "STANDARD"
    }
  }
}
