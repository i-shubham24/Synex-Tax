variable "environment" {
  type        = string
  description = "Deployment environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where ECS tasks run"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for Application Load Balancer"
}

variable "private_app_subnet_ids" {
  type        = list(string)
  description = "Private app subnets for backend API and workers"
}

variable "isolated_subnet_ids" {
  type        = list(string)
  description = "Isolated subnets for air-gapped FVU runner containers"
}

variable "app_security_group_id" {
  type        = string
  description = "Security group ID for application services"
}

variable "fvu_zero_egress_security_group_id" {
  type        = string
  description = "Zero egress security group ID for FVU runner containers"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for log group and ECR repository encryption"
}
