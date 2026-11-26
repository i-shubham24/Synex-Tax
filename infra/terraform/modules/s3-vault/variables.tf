variable "environment" {
  type        = string
  description = "Deployment environment name"
}

variable "aws_account_id" {
  type        = string
  description = "AWS Account ID for globally unique bucket naming"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for server side encryption in primary region"
}
