FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

WORKDIR /app

# Set non-interactive environment variables to avoid prompts
ENV DEBIAN_FRONTEND=noninteractive TZ=UTC

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3.10-dev \
    python3-pip \
    redis-server \
    git \
    libopencv-dev \
    python3-opencv \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend ./backend
COPY workers ./workers
COPY config ./config

# Create models directory
RUN mkdir -p /app/models

# Expose ports
EXPOSE 8000 6379

# Default command (can be overridden)
CMD ["python3", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
