# KMS & Secrets Module: Dedicated CMK with automatic rotation for India residency compliance

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_kms_key" "primary" {
  description             = "SynTax master encryption key for ${var.environment} (ap-south-1)"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "${var.environment}-syntax-kms-key"
    Environment = var.environment
    Compliance  = "MCA-Rule-3-6-KMS-CMK"
  }
}

resource "aws_kms_alias" "primary" {
  name          = "alias/${var.environment}-syntax-master-key"
  target_key_id = aws_kms_key.primary.key_id
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.environment}/syntax/database/credentials"
  description             = "Master credentials for PostgreSQL 17 database"
  kms_key_id              = aws_kms_key.primary.arn
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret" "api_secrets" {
  name                    = "${var.environment}/syntax/api/secrets"
  description             = "JWT HMAC secrets, GSP credentials, and portal encryptions"
  kms_key_id              = aws_kms_key.primary.arn
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
  }
}
