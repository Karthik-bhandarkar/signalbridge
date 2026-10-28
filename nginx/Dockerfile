# =============================================================================
# Production Reverse Proxy: Nginx
# Routes traffic between Next.js SSR frontend and Django WSGI backend
# =============================================================================
FROM nginx:1.25-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
