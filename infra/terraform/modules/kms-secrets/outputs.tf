output "kms_key_arn" {
  description = "ARN of the primary KMS key"
  value       = aws_kms_key.primary.arn
}

output "kms_key_id" {
  description = "ID of the primary KMS key"
  value       = aws_kms_key.primary.key_id
}

output "db_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "api_secrets_secret_arn" {
  description = "ARN of the API secrets"
  value       = aws_secretsmanager_secret.api_secrets.arn
}
