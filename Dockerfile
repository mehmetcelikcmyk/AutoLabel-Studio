# =====================================================
# YOLO Editor — Production Dockerfile
# =====================================================
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install essential system packages for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code and assets
COPY . .

# Ensure storage directories exist
RUN mkdir -p exports static

# Never run the web process as root. Give appuser a writable home and temp Ultralytics config dir.
ENV HOME=/home/appuser \
    YOLO_CONFIG_DIR=/tmp/Ultralytics
RUN useradd --system --create-home --uid 10001 appuser && \
    mkdir -p /home/appuser/.cache /tmp/Ultralytics && \
    chown -R appuser:appuser /app /home/appuser /tmp/Ultralytics
USER appuser

# Expose port (Railway injects PORT dynamically; default 8000)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

# Start FastAPI application
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
