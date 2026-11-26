variable "environment" {
  type        = string
  description = "Deployment environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the database resides"
}

variable "isolated_subnet_ids" {
  type        = list(string)
  description = "Isolated subnets for DB subnet group"
}

variable "app_security_group_id" {
  type        = string
  description = "Security group of the application tasks allowed to access DB"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Key ARN for storage encryption"
}

variable "master_password" {
  type        = string
  description = "Master password for PostgreSQL database"
  sensitive   = true
}

variable "instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t4g.medium"
}

variable "multi_az" {
  type        = bool
  description = "Whether to enable Multi-AZ deployment"
  default     = false
}
