# Getting Started Guide

## 🎯 Quick Start (5 minutes)

### Prerequisites
- Python 3.10+
- Node.js 16+ (for frontend)
- NVIDIA GPU with CUDA support
- Redis (or Docker for containerized Redis)

### Option 1: Local Development (Recommended for Development)

1. **Setup Python Backend**:
```bash
cd AR_Project
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. **Start services**:
```bash
./dev.sh
```

This automatically starts:
- Redis server (localhost:6379)
- FastAPI backend (http://localhost:8000)
- 2 YOLOv8 detection workers

3. **Setup Frontend** (in a new terminal):
```bash
cd frontend
npm install
npm start
```

Opens at http://localhost:3000

4. **Test the app**:
- Click "▶ Start Streaming"
- Grant webcam permission
- You should see green boxes appearing on objects (once you train a model)

### Option 2: Docker (Recommended for Production)

```bash
cd AR_Project
docker-compose up
```

This starts everything in containers with GPU support.

Access the backend API at: http://localhost:8000

For frontend, you still need to run locally:
```bash
cd frontend
npm install  
npm start
```

## 📊 Training Your Custom Model

The app comes with YOLOv8 pre-downloaded, but it's trained on generic objects. Here's how to train on your specific objects:

### Step 1: Prepare Your Dataset

You need labeled images. If you don't have them:

**Option A: Roboflow** (Recommended, easiest)
1. Go to https://roboflow.com
2. Create account (free tier OK)
3. Upload images
4. Label them with bounding boxes on-platform
5. Export as "YOLO v8" format
6. Extract to `data/my_dataset/`

**Option B: LabelImg** (Local tool)
1. Install: `pip install labelImg`
2. Run: `labelImg`
3. Open image directory, draw boxes, save annotations
4. Convert annotations to YOLO format

### Step 2: Organize Dataset

Expected folder structure:
```
data/my_dataset/
├── images/
│   ├── train/
│   │   ├── img1.jpg
│   │   ├── img2.jpg
│   │   └── ...
│   ├── val/
│   │   └── ...
│   └── test/
│       └── ...
├── labels/
│   ├── train/
│   │   ├── img1.txt  (YOLO format)
│   │   ├── img2.txt
│   │   └── ...
│   ├── val/
│   │   └── ...
│   └── test/
│       └── ...
```

YOLO label format `.txt`:
```
<class_id> <x_center_norm> <y_center_norm> <width_norm> <height_norm>
```

Example:
```
0 0.5 0.6 0.3 0.4
1 0.2 0.3 0.15 0.25
```

### Step 3: Create Dataset Config

```bash
python training/prepare_dataset.py \
  --images-dir data/my_dataset/images \
  --annotations-dir data/my_dataset/labels \
  --output-dir data/my_dataset_yolo \
  --classes "person,car,dog" \
  --train-ratio 0.7 \
  --val-ratio 0.15
```

This creates `data/my_dataset_yolo/dataset.yaml`

### Step 4: Train

```bash
python training/train.py --dataset data/my_dataset_yolo/dataset.yaml --train
```

**What happens**:
- Trains YOLOv8m model for 100 epochs
- Validates after each epoch
- Early stops if no improvement for 20 epochs
- Shows confusion matrix, precision/recall graphs
- Exports model to ONNX and TensorRT formats

**Training time**: ~30-45 minutes on RTX 4070 (depends on dataset size)

### Step 5: Use Trained Model

Copy best weights:
```bash
cp runs/detect/custom/weights/best.pt models/best.pt
```

Update `.env`:
```bash
MODEL_PATH=models/best.pt
```

Restart backend:
```bash
# Kill current server (Ctrl+C)
# Run: ./dev.sh
```

Now the app will use your trained model!

## 🧪 Testing Without Training

Don't have a dataset yet? No problem! The app still works:

1. Start the app (it will use a generic pre-trained YOLOv8m)
2. It will detect COCO classes: person, car, dog, cat, truck, bus, etc.
3. Train your custom model when ready

## 🛠️ Architecture Overview

```
┌─────────────────────────┐
│  Your Webcam            │
└────────────┬────────────┘
             │ 
             ▼ JPEG frames @ 20 FPS
┌─────────────────────────┐
│  React Frontend         │ (http://localhost:3000)
│  - Video capture       │
│  - Draw bounding boxes │
│  - Performance stats   │
└────────────┬────────────┘
             │ WebSocket
             ▼
┌─────────────────────────┐
│  FastAPI Backend        │ (http://localhost:8000)
│  - WebSocket handler   │
│  - Frame validation    │
│  - Queue management    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Redis Job Queue        │
└────────────┬────────────┘
             │
       ┌─────┴─────┐
       ▼           ▼
┌────────────┐ ┌────────────┐
│  Worker 1  │ │  Worker 2  │
│ YOLOv8m    │ │ YOLOv8m    │ (GPU processes)
└────────────┘ └────────────┘
       │           │
       └─────┬─────┘
             ▼
    ┌──────────────────┐
    │ Redis Pub/Sub    │
    │ (Results)        │
    └──────────────────┘
             │
             ▼
┌─────────────────────────┐
│  React Frontend         │
│  - Display detections  │
│  - Real-time rendering │
└─────────────────────────┘
```

## 📁 Key Files Explained

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI WebSocket server |
| `workers/detector.py` | YOLOv8 inference logic |
| `frontend/src/App.tsx` | Main React app |
| `frontend/src/components/VideoStream.tsx` | Video capture + streaming |
| `training/train.py` | Model training pipeline |
| `.env` | Configuration (Redis, model path, etc.) |
| `docker-compose.yml` | Multi-container setup |

## ⚙️ Key Configurations

Edit `.env` to customize:

```bash
# Redis connection
REDIS_HOST=localhost        # Change if Redis on different machine
REDIS_PORT=6379

# Backend server
BACKEND_PORT=8000
DEBUG=false                 # true for development (auto-reload)

# Model and inference
MODEL_PATH=models/best.pt   # Path to trained weights
CONFIDENCE_THRESHOLD=0.5    # Detection confidence (0-1)
```

## 🚀 Command Reference

### Development
```bash
./dev.sh                    # Start all services locally
./start.sh                  # Alternative start script
```

### Training
```bash
# Train model
python training/train.py --dataset data/my_dataset/dataset.yaml --train

# Validate model
python training/train.py --dataset data/my_dataset/dataset.yaml --validate models/best.pt

# Export to ONNX/TensorRT
python training/train.py --export models/best.pt
```

### Docker
```bash
docker-compose up           # Start all services in containers
docker-compose down         # Stop all services
docker-compose logs backend # View backend logs
docker-compose logs worker  # View worker logs
```

### Utilities
```bash
# Check if Redis is running
redis-cli ping              # Should return: PONG

# Check backend health
curl http://localhost:8000/health

# Check system status
curl http://localhost:8000/status

# View Redis queue
redis-cli DBSIZE
```

## 📊 Monitoring Performance

### In the Web App
- Click "🐛 Debug" button to see:
  - Confidence scores
  - Bounding box coordinates
  - FPS counter
  - Latency stats

### Terminal
Watch worker activity:
```bash
# Terminal with workers running
# You'll see: "got job" and "finished job" messages
```

Check GPU utilization:
```bash
nvidia-smi              # GPU stats
watch -n 1 nvidia-smi   # Live update every second
```

## ❓ Common Issues

### "WebSocket connection failed"
```bash
# Check if backend is running
curl http://localhost:8000/health

# Check Redis
redis-cli ping

# Restart everything
./dev.sh
```

### "CUDA not available"
```bash
# Check PyTorch CUDA support
python -c "import torch; print(torch.cuda.is_available())"

# If False, reinstall PyTorch for CUDA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### "Model file not found"
```bash
# Verify model exists
ls -la models/best.pt

# Download pre-trained model
python -c "from ultralytics import YOLO; YOLO('yolov8m.pt')"
```

### "Permission denied" on .sh files
```bash
chmod +x *.sh
./dev.sh
```

## 🎓 Next Steps

1. **Get data**: Collect labeled images of objects you want to detect
2. **Train**: Run the training pipeline
3. **Deploy**: Use your trained model in production
4. **Monitor**: Track performance and iterate

For more details, see [README.md](README.md)
