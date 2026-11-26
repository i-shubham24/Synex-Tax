output "endpoint" {
  description = "Connection endpoint for PostgreSQL database"
  value       = aws_db_instance.postgres.endpoint
}

output "address" {
  description = "Host address for PostgreSQL database"
  value       = aws_db_instance.postgres.address
}

output "port" {
  description = "Port for PostgreSQL database"
  value       = aws_db_instance.postgres.port
}

output "db_name" {
  description = "Name of the initial database"
  value       = aws_db_instance.postgres.db_name
}
