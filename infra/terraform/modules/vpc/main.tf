# VPC Module: Mumbai (ap-south-1) with public, private app, and isolated database/runner subnets
# Includes zero-egress security group for isolated FVU Docker runners

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.environment}-syntax-vpc"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "MCA-Rule-3-6-India-Residency"
  }
}

# Public Subnets (NAT Gateway and ALB)
resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name        = "${var.environment}-public-subnet-${count.index + 1}"
    Environment = var.environment
    Tier        = "Public"
  }
}

# Private App Subnets (API, Queue Workers, Recon Workers)
resource "aws_subnet" "private_app" {
  count             = length(var.private_app_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_app_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "${var.environment}-private-app-${count.index + 1}"
    Environment = var.environment
    Tier        = "Private-App"
  }
}

# Isolated Subnets (RDS PostgreSQL 17, Redis, and Zero-Egress FVU Runners)
resource "aws_subnet" "isolated" {
  count             = length(var.isolated_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.isolated_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "${var.environment}-isolated-${count.index + 1}"
    Environment = var.environment
    Tier        = "Isolated-Data-And-Runners"
  }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.environment}-syntax-igw"
    Environment = var.environment
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name        = "${var.environment}-syntax-nat-eip"
    Environment = var.environment
  }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name        = "${var.environment}-syntax-nat"
    Environment = var.environment
  }

  depends_on = [aws_internet_gateway.gw]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = {
    Name        = "${var.environment}-public-rt"
    Environment = var.environment
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }

  tags = {
    Name        = "${var.environment}-private-rt"
    Environment = var.environment
  }
}

resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.environment}-isolated-rt"
    Environment = var.environment
    Description = "Strictly isolated with no internet gateway or NAT route"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private_app)
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "isolated" {
  count          = length(aws_subnet.isolated)
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated.id
}

# Zero-Egress Security Group for FVU Runners (air-gapped execution)
resource "aws_security_group" "fvu_zero_egress" {
  name        = "${var.environment}-syntax-fvu-zero-egress-sg"
  description = "Zero egress security group for air-gapped NSDL FVU runner containers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Internal worker task communication only"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Strictly NO egress rule defined: any outgoing connection is blocked at hypervisor level

  tags = {
    Name        = "${var.environment}-syntax-fvu-zero-egress"
    Environment = var.environment
    Security    = "Zero-Egress-Air-Gapped"
  }
}

# App Security Group (API and Workers)
resource "aws_security_group" "app" {
  name        = "${var.environment}-syntax-app-sg"
  description = "Security group for SynTax backend API and queue workers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow inbound from ALB on port 4000"
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Allow outbound to NAT gateway for statutory GSP and TRACES calls"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-syntax-app-sg"
    Environment = var.environment
  }
}
