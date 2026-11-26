variable "aws_region" {
  type        = string
  description = "Primary AWS region for India operations"
  default     = "ap-south-1"
}

variable "aws_dr_region" {
  type        = string
  description = "Secondary AWS region for India warm DR and MCA compliance"
  default     = "ap-south-2"
}

variable "aws_account_id" {
  type        = string
  description = "AWS Account ID for S3 bucket naming"
  default     = "123456789012"
}

variable "db_master_password" {
  type        = string
  description = "Master password for staging PostgreSQL 17 database"
  sensitive   = true
  default     = "SynTaxStaging2026SecurePass!"
}

variable "redis_auth_token" {
  type        = string
  description = "Redis AUTH secret password"
  sensitive   = true
  default     = "SynTaxRedisAuthStaging2026TokenSecret!"
}

variable "alert_email" {
  type        = string
  description = "Email address for AWS Activate budget threshold notifications"
  default     = "alerts@synextax.in"
}
