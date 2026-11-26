# Redis Module: Right-sized ElastiCache Redis 7 for BullMQ and Distributed Locks
# Placed in isolated subnets with in-transit and at-rest encryption

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.environment}-syntax-redis-subnet-group"
  description = "Subnet group for SynTax Redis cluster in isolated subnets"
  subnet_ids  = var.isolated_subnet_ids

  tags = {
    Name        = "${var.environment}-syntax-redis-subnets"
    Environment = var.environment
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.environment}-syntax-redis-sg"
  description = "Inbound Redis 6379 from backend app tasks only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis port from backend API and worker security group"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  egress {
    description = "Allow all outbound responses"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-syntax-redis-sg"
    Environment = var.environment
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.environment}-syntax-redis"
  description          = "SynTax Redis 7 cluster for BullMQ queues and distributed locks"
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  port                 = 6379
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  auth_token                 = var.auth_token

  automatic_failover_enabled = var.num_cache_clusters > 1 ? true : false
  apply_immediately          = true

  tags = {
    Name        = "${var.environment}-syntax-redis"
    Environment = var.environment
  }
}
