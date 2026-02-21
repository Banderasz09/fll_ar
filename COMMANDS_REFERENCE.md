#!/bin/bash
# Command Reference for AR Object Detection

# =============================================================================
# SETUP & INSTALLATION
# =============================================================================

# Initial setup (one time)
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup (one time)
cd frontend
npm install
cd ..

# =============================================================================
# DEVELOPMENT
# =============================================================================

# Option 1: Start all services locally (recommended for development)
./dev.sh

# Option 2: Start individual services
# Terminal 1: Redis
redis-server

# Terminal 2: Backend
source venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Workers
source venv/bin/activate
rq worker -u redis://localhost:6379/0 --with-scheduler

# Terminal 4+: More workers (for parallel processing)
rq worker -u redis://localhost:6379/0 --with-scheduler

# Terminal 5: Frontend
cd frontend
npm start

# =============================================================================
# DOCKER
# =============================================================================

# Start all services in containers
docker-compose up

# Stop all services
docker-compose down

# View logs
docker-compose logs -f backend   # Backend logs
docker-compose logs -f worker    # Worker logs
docker-compose logs -f redis     # Redis logs

# Rebuild images (after code changes)
docker-compose build

# =============================================================================
# TRAINING
# =============================================================================

# Prepare dataset directory structure
python training/prepare_dataset.py \
  --images-dir data/raw_images \
  --annotations-dir data/raw_annotations \
  --output-dir data/my_dataset \
  --classes "class1,class2,class3" \
  --train-ratio 0.7 \
  --val-ratio 0.15

# Train custom model
python training/train.py \
  --dataset data/my_dataset/dataset.yaml \
  --train

# Resume training from checkpoint
python training/train.py \
  --dataset data/my_dataset/dataset.yaml \
  --train \
  --resume

# Validate trained model
python training/train.py \
  --dataset data/my_dataset/dataset.yaml \
  --validate models/best.pt

# Export model to ONNX/TensorRT
python training/train.py \
  --export models/best.pt

# =============================================================================
# TESTING & DEBUGGING
# =============================================================================

# Check if Redis is running
redis-cli ping         # Should return: PONG

# Check backend health
curl http://localhost:8000/health

# Check system status
curl http://localhost:8000/status

# Check OpenAPI documentation
curl http://localhost:8000/openapi.json

# Monitor Redis queue
redis-cli --stat

# Check Redis key count
redis-cli DBSIZE

# Monitor GPU usage
nvidia-smi              # One-time snapshot
nvidia-smi -l 500       # Live update every 500ms
watch -n 1 nvidia-smi   # Live update every 1 second

# Check CUDA status
python -c "import torch; print('CUDA available:', torch.cuda.is_available())"

# Check GPU memory
python -c "import torch; print(f'CUDA memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB')"

# Run frontend development server
cd frontend
npm start               # Starts at http://localhost:3000

# Run frontend tests
cd frontend
npm test

# Build frontend for production
cd frontend
npm run build          # Creates build/ directory

# =============================================================================
# PRODUCTION
# =============================================================================

# Start with production script
./start_production.sh

# Deploy with systemd (after installation)
sudo systemctl start ar-detection
sudo systemctl stop ar-detection
sudo systemctl status ar-detection
sudo systemctl enable ar-detection  # Start on boot

# View systemd logs
sudo journalctl -u ar-detection -f

# =============================================================================
# UTILITIES
# =============================================================================

# Verify project setup
./verify_setup.sh

# List all Python dependencies with versions
pip freeze

# Check for outdated packages
pip list --outdated

# Update dependencies
pip install --upgrade -r requirements.txt

# Update Node packages
cd frontend && npm update && cd ..

# Clean up Docker resources (careful!)
docker system prune

# Remove trained models to free space
rm -rf runs/

# =============================================================================
# TROUBLESHOOTING
# =============================================================================

# Kill process on port 8000 (if backend hangs)
lsof -ti :8000 | xargs kill -9

# Kill all Python processes
pkill -f python

# Kill all node processes
pkill -f node

# Restart Redis
redis-cli shutdown
redis-server

# Clear Redis database
redis-cli FLUSHALL

# Reset virtual environment
deactivate
rm -rf venv/
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# =============================================================================
# MONITORING IN PRODUCTION
# =============================================================================

# Monitor system resource usage
top                    # CPU and memory
iostat                # Disk I/O
netstat -tuln         # Network connections

# Monitor with htop (better than top)
htop

# Monitor GPU with persistent background task
while true; do clear; nvidia-smi; sleep 1; done

# Monitor backend logs
tail -f /var/log/ar-detection.log

# Monitor worker metrics
redis-cli DBSIZE       # Queue depth
redis-cli LLEN rq:queue:default  # Specific queue size

# =============================================================================
# GIT & DEPLOYMENT
# =============================================================================

# Initialize git repo (if not already done)
git init
git add .
git commit -m "Initial commit: AR Object Detection app"

# Push to GitHub
git remote add origin https://github.com/yourusername/ar-detection.git
git push -u origin main

# Clone for deployment
git clone https://github.com/yourusername/ar-detection.git
cd ar-detection
git pull  # Update code

# =============================================================================
# DOCUMENTATION
# =============================================================================

# See full documentation
cat README.md           # Full setup and architecture
cat GETTING_STARTED.md  # Quick start guide
cat IMPLEMENTATION_COMPLETE.md  # Summary of implementation

# =============================================================================
# EXAMPLES
# =============================================================================

# Example: Send a test frame for detection (requires python-requests)
# curl -X POST http://localhost:8000/detect?frame_id=test:0 \
#   -F "frame=@test_image.jpg"

# Example: Monitor workers while training
# while true; do redis-cli LLEN rq:queue:default && sleep 1; done

# Example: Train model and deploy in one command
# python training/train.py --dataset data/dataset.yaml --train && \
# cp runs/detect/custom/weights/best.pt models/best.pt && \
# systemctl restart ar-detection
