output "primary_vault_bucket_name" {
  description = "Name of the primary Mumbai S3 vault bucket"
  value       = aws_s3_bucket.primary_vault.bucket
}

output "primary_vault_bucket_arn" {
  description = "ARN of the primary Mumbai S3 vault bucket"
  value       = aws_s3_bucket.primary_vault.arn
}

output "dr_vault_bucket_name" {
  description = "Name of the Hyderabad DR S3 vault bucket"
  value       = aws_s3_bucket.dr_vault.bucket
}

output "dr_vault_bucket_arn" {
  description = "ARN of the Hyderabad DR S3 vault bucket"
  value       = aws_s3_bucket.dr_vault.arn
}
