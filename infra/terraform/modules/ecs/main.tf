# ECS Module: Fargate cluster, ECR repositories, ALB, and task definitions
# Isolated NSDL FVU runners are scheduled in isolated subnets with zero-egress SG

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${var.environment}-syntax-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.environment}-syntax-cluster"
    Environment = var.environment
  }
}

# ECR Repositories for the 5 services
locals {
  services = [
    "syntax-api",
    "syntax-queue-worker",
    "syntax-recon-worker",
    "syntax-fvu-v1-2",
    "syntax-fvu-v9-5"
  ]
}

resource "aws_ecr_repository" "repos" {
  for_each             = toset(local.services)
  name                 = "${var.environment}-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }

  tags = {
    Environment = var.environment
    Service     = each.key
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "logs" {
  for_each          = toset(local.services)
  name              = "/ecs/${var.environment}/${each.key}"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn

  tags = {
    Environment = var.environment
    Service     = each.key
  }
}

# IAM Execution and Task Roles
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.environment}-syntax-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name = "${var.environment}-syntax-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Application Load Balancer
resource "aws_security_group" "alb" {
  name        = "${var.environment}-syntax-alb-sg"
  description = "Public ALB security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow inbound HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow inbound HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow forward to private app subnets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-syntax-alb-sg"
    Environment = var.environment
  }
}

resource "aws_lb" "api" {
  name               = "${var.environment}-syntax-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  drop_invalid_header_fields = true

  tags = {
    Name        = "${var.environment}-syntax-alb"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.environment}-syntax-api-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    port                = "4000"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name        = "${var.environment}-syntax-api-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ECS Service for SynTax API (0.5 vCPU, 1 GB RAM)
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.environment}-syntax-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "syntax-api"
      image     = "${aws_ecr_repository.repos["syntax-api"].repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.logs["syntax-api"].name
          "awslogs-region"        = "ap-south-1"
          "awslogs-stream-prefix" = "api"
        }
      }
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "4000" }
      ]
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${var.environment}-syntax-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_app_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "syntax-api"
    container_port   = 4000
  }

  depends_on = [aws_lb_listener.http]
}
