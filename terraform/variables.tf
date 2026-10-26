variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name prefix for all provisioned SignalBridge resources"
  type        = string
  default     = "signalbridge"
}

variable "environment" {
  description = "Environment name (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the dedicated SignalBridge VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "instance_type" {
  description = "EC2 instance type for the Docker Compose application host"
  type        = string
  default     = "t3.medium"
}

variable "ssh_key_name" {
  description = "Existing AWS EC2 Key Pair name for SSH access (optional)"
  type        = string
  default     = ""
}

variable "admin_cidr_blocks" {
  description = "Allowed CIDR blocks for administrative SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "signalbridge_db"
}

variable "db_username" {
  description = "Master username for PostgreSQL database"
  type        = string
  default     = "signalbridge_admin"
}

variable "db_password" {
  description = "Master password for PostgreSQL database"
  type        = string
  sensitive   = true
  default     = "SignalBridge_Prod_2026_Secure!"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
}
