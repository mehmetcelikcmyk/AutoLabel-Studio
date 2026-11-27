# =====================================================
# YOLO Editor — Production Dockerfile
# =====================================================
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install essential system packages for OpenCV, image processing, and Ultralytics CLIP
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python requirements + CLIP for YOLO-World text prompts
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir git+https://github.com/ultralytics/CLIP.git && \
    python -c "import os, gc, torch, clip; url = clip.clip._MODELS['ViT-B/32']; mp = clip.clip._download(url, '/tmp'); jm = torch.jit.load(mp, map_location='cpu').eval(); sd = {k: v.half() for k, v in jm.state_dict().items() if not k.startswith('visual.') and k not in ('input_resolution', 'context_length', 'vocab_size', 'logit_scale')}; del jm; gc.collect(); torch.save(sd, '/app/clip_vitb32_text_fp16.pt'); os.remove(mp)"

# Copy source code and assets
COPY . .

# Pre-download default lightweight YOLO weights so cold start never spikes RAM or delays first prediction
RUN python -c "from ultralytics.utils.downloads import attempt_download_asset; attempt_download_asset('/app/yolov8s-worldv2.pt'); attempt_download_asset('/app/yolov8n.pt')"

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
