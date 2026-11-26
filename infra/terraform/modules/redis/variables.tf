variable "environment" {
  type        = string
  description = "Deployment environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where Redis resides"
}

variable "isolated_subnet_ids" {
  type        = list(string)
  description = "Isolated subnets for Redis subnet group"
}

variable "app_security_group_id" {
  type        = string
  description = "App security group allowed to access Redis"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Key ARN for at rest encryption"
}

variable "auth_token" {
  type        = string
  description = "Redis AUTH password token"
  sensitive   = true
}

variable "node_type" {
  type        = string
  description = "Cache node type"
  default     = "cache.t4g.micro"
}

variable "num_cache_clusters" {
  type        = number
  description = "Number of cache clusters"
  default     = 1
}
