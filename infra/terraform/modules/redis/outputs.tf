output "primary_endpoint_address" {
  description = "Primary endpoint address for Redis connection"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "port" {
  description = "Port number for Redis connection"
  value       = aws_elasticache_replication_group.redis.port
}
