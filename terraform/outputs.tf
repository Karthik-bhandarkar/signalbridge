output "alb_dns_name" {
  description = "Public Application Load Balancer DNS Name (Main Entrypoint)"
  value       = aws_lb.alb.dns_name
}

output "alb_url" {
  description = "Public HTTP URL of the SignalBridge Ingestion Gateway"
  value       = "http://${aws_lb.alb.dns_name}"
}

output "ec2_public_ip" {
  description = "Public IP of the EC2 application host"
  value       = aws_instance.app_server.public_ip
}

output "rds_endpoint" {
  description = "Amazon RDS PostgreSQL Hostname"
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "Amazon RDS PostgreSQL Port"
  value       = aws_db_instance.postgres.port
}

output "elasticache_endpoint" {
  description = "Amazon ElastiCache Redis Primary Endpoint Hostname"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "s3_bucket_name" {
  description = "Amazon S3 Raw Webhook Archive Bucket Name"
  value       = aws_s3_bucket.archives.id
}

output "secrets_manager_name" {
  description = "AWS Secrets Manager Secret Name"
  value       = aws_secretsmanager_secret.app_secrets.name
}

output "aws_region" {
  description = "AWS Deployment Region"
  value       = var.aws_region
}
