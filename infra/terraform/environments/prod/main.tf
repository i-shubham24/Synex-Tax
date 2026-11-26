# SynTax Production Environment: 100% India Data Residency
# Primary Region: ap-south-1 (Mumbai) with Multi-AZ
# Warm DR Region: ap-south-2 (Hyderabad) for MCA Rule 3(6) compliance

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  alias  = "primary"

  default_tags {
    tags = {
      Project     = "SynTax"
      Environment = "prod"
      ManagedBy   = "Terraform"
      Residency   = "India-ap-south-1"
    }
  }
}

provider "aws" {
  region = var.aws_dr_region
  alias  = "dr"

  default_tags {
    tags = {
      Project     = "SynTax"
      Environment = "prod"
      ManagedBy   = "Terraform"
      Residency   = "India-ap-south-2-DR"
    }
  }
}

module "vpc" {
  source      = "../../modules/vpc"
  environment = "prod"
}

module "kms_secrets" {
  source      = "../../modules/kms-secrets"
  environment = "prod"
}

module "s3_vault" {
  source         = "../../modules/s3-vault"
  environment    = "prod"
  aws_account_id = var.aws_account_id
  kms_key_arn    = module.kms_secrets.kms_key_arn

  providers = {
    aws.primary = aws.primary
    aws.dr      = aws.dr
  }
}

module "rds" {
  source                = "../../modules/rds"
  environment           = "prod"
  vpc_id                = module.vpc.vpc_id
  isolated_subnet_ids   = module.vpc.isolated_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id
  kms_key_arn           = module.kms_secrets.kms_key_arn
  master_password       = var.db_master_password
  instance_class        = "db.r7g.large"
  multi_az              = true
}

module "redis" {
  source                = "../../modules/redis"
  environment           = "prod"
  vpc_id                = module.vpc.vpc_id
  isolated_subnet_ids   = module.vpc.isolated_subnet_ids
  app_security_group_id = module.vpc.app_security_group_id
  kms_key_arn           = module.kms_secrets.kms_key_arn
  auth_token            = var.redis_auth_token
  node_type             = "cache.t4g.small"
  num_cache_clusters    = 2
}

module "ecs" {
  source                            = "../../modules/ecs"
  environment                       = "prod"
  vpc_id                            = module.vpc.vpc_id
  public_subnet_ids                 = module.vpc.public_subnet_ids
  private_app_subnet_ids            = module.vpc.private_app_subnet_ids
  isolated_subnet_ids               = module.vpc.isolated_subnet_ids
  app_security_group_id             = module.vpc.app_security_group_id
  fvu_zero_egress_security_group_id = module.vpc.fvu_zero_egress_security_group_id
  kms_key_arn                       = module.kms_secrets.kms_key_arn
}

resource "aws_budgets_budget" "prod_budget" {
  name              = "syntax-prod-monthly-budget"
  budget_type       = "COST"
  limit_amount      = "1500"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
