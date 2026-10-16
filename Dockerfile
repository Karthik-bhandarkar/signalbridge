# =============================================================================
# SignalBridge Multi-Stage Production & Development Dockerfile
# Base: Official Python 3.11 Debian Slim (Optimized for minimal image size)
# =============================================================================
FROM python:3.11-slim

# 1. Python Runtime Optimization Directives
# - PYTHONDONTWRITEBYTECODE: Disables writing .pyc files to disk inside immutable container
# - PYTHONUNBUFFERED: Flushes stdout/stderr immediately to Docker console without buffering
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Install operating system packages required for PostgreSQL C-extensions & networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 4. Dependency Layer Caching
# Copy only the requirements directory first to leverage Docker layer caching.
# Frequent code edits will NOT trigger a slow reinstall of Python dependencies.
COPY requirements/ /app/requirements/

# 5. Install Python dependencies (local environment including test and dev tooling)
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements/local.txt

# 6. Copy the rest of the application codebase
COPY . /app/

# 7. Document the default port exposed by the Django application
EXPOSE 8000

# 8. Default command executed when container is launched
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
