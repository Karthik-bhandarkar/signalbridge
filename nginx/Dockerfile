# =============================================================================
# Stage 1: Build Vite React Single Page Application (SPA)
# =============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# =============================================================================
# Stage 2: Production Nginx Server
# =============================================================================
FROM nginx:1.25-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy compiled React frontend assets
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
