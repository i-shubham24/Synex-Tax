# RDS Module: PostgreSQL 17 right-sized for $5,000 AWS Activate Runway
# Encrypted with KMS CMK, placed in isolated subnets with strict security group

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_db_subnet_group" "rds" {
  name        = "${var.environment}-syntax-rds-subnet-group"
  description = "Subnet group for SynTax PostgreSQL 17 in isolated subnets"
  subnet_ids  = var.isolated_subnet_ids

  tags = {
    Name        = "${var.environment}-syntax-db-subnets"
    Environment = var.environment
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.environment}-syntax-rds-sg"
  description = "Inbound PostgreSQL 5432 from backend app services only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from ECS App and Worker tasks"
    from_port       = 5432
    to_port         = 5432
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
    Name        = "${var.environment}-syntax-rds-sg"
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "pg17" {
  name        = "${var.environment}-syntax-pg17-params"
  family      = "postgres17"
  description = "PostgreSQL 17 parameter group with strict audit logging"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_db_instance" "postgres" {
  identifier                  = "${var.environment}-syntax-db"
  engine                      = "postgres"
  engine_version              = "17.2"
  instance_class              = var.instance_class
  allocated_storage           = 50
  max_allocated_storage       = 200
  storage_type                = "gp3"
  storage_encrypted           = true
  kms_key_id                  = var.kms_key_arn
  publicly_accessible         = false
  multi_az                    = var.multi_az
  db_subnet_group_name        = aws_db_subnet_group.rds.name
  vpc_security_group_ids      = [aws_security_group.rds.id]
  parameter_group_name        = aws_db_parameter_group.pg17.name
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  deletion_protection         = var.environment == "prod" ? true : false
  skip_final_snapshot         = var.environment == "staging" ? true : false
  final_snapshot_identifier   = "${var.environment}-syntax-db-final-snapshot"

  db_name  = "synextax"
  username = "synextax_admin"
  password = var.master_password

  backup_retention_period = var.environment == "prod" ? 35 : 7
  backup_window           = "19:00-20:00"
  maintenance_window      = "Sun:20:30-Sun:21:30"
  copy_tags_to_snapshot   = true

  tags = {
    Name        = "${var.environment}-syntax-postgres-17"
    Environment = var.environment
    Compliance  = "MCA-Rule-3-6-PostgreSQL-17"
  }
}
