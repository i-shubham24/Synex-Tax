output "vpc_id" {
  description = "Production VPC ID"
  value       = module.vpc.vpc_id
}

output "api_alb_dns_name" {
  description = "Public ALB DNS address for SynTax API production backend"
  value       = module.ecs.alb_dns_name
}

output "database_endpoint" {
  description = "Production PostgreSQL 17 endpoint"
  value       = module.rds.endpoint
}

output "redis_endpoint" {
  description = "Production Redis endpoint"
  value       = module.redis.primary_endpoint_address
}

output "mumbai_s3_vault_bucket" {
  description = "Primary S3 vault bucket name in Mumbai"
  value       = module.s3_vault.primary_vault_bucket_name
}

output "hyderabad_s3_dr_bucket" {
  description = "DR S3 vault bucket name in Hyderabad"
  value       = module.s3_vault.dr_vault_bucket_name
}
