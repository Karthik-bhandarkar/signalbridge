# =============================================================================
# Amazon CloudFront Distribution (HTTPS Public Entrypoint Without Custom Domain)
# =============================================================================
# Provides an AWS-managed HTTPS hostname (https://<distribution-id>.cloudfront.net)
# routing traffic to the Application Load Balancer origin without requiring a purchased domain.

resource "random_password" "origin_secret" {
  length  = 32
  special = false
}

resource "aws_cloudfront_distribution" "app_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "SignalBridge CloudFront Gateway"
  price_class         = "PriceClass_100" # US, Canada, Europe (Lowest cost tier)

  origin {
    domain_name = aws_lb.alb.dns_name
    origin_id   = "SignalBridge-ALB-Origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Defense-in-depth: Secret header to verify requests originate from CloudFront
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_secret.result
    }
  }

  # 1. Default Cache Behavior (React SPA Frontend)
  default_cache_behavior {
    target_origin_id       = "SignalBridge-ALB-Origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # 2. Dynamic Webhooks Behavior (POST /api/v1/webhooks/* -> Never Cache, Forward All Headers)
  ordered_cache_behavior {
    path_pattern           = "/api/v1/webhooks/*"
    target_origin_id       = "SignalBridge-ALB-Origin"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    forwarded_values {
      query_string = true
      headers      = ["*"] # Forward all headers including X-Signature-SHA256, Content-Type, etc.
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # 3. Dynamic REST API & Health Behaviors (Never Cache, Forward Session & CSRF Cookies)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "SignalBridge-ALB-Origin"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["Host", "Authorization", "X-CSRFToken", "Origin", "Referer"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  ordered_cache_behavior {
    path_pattern           = "/health/*"
    target_origin_id       = "SignalBridge-ALB-Origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # Viewer Certificate: Free Default CloudFront SSL (*.cloudfront.net)
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "${var.project_name}-cloudfront"
  }
}

output "cloudfront_domain_name" {
  description = "Public HTTPS CloudFront Hostname (No custom domain needed)"
  value       = aws_cloudfront_distribution.app_distribution.domain_name
}

output "cloudfront_url" {
  description = "Main Public HTTPS Entrypoint for SignalBridge"
  value       = "https://${aws_cloudfront_distribution.app_distribution.domain_name}"
}
