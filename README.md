# AR Project - Real-time Object Detection Web App

A high-performance web application for real-time object detection using WebSocket streaming, FastAPI, and YOLOv8.

## Architecture

```
Browser (React)
    ↓ WebSocket (1080p JPEG frames)
FastAPI Server (WebSocket handler)
    ↓ Redis Job Queue
Python Workers (YOLOv8 inference on GPU)
    ↓ Redis Pub/Sub (detection results)
Browser (Render bounding boxes)
```

## Quick Setup

### Prerequisites
- Python 3.10+
- NVIDIA GPU (RTX 4070 in your case)
- CUDA 12.2 or higher
- Docker & Docker Compose (optional)

### Local Development

1. **Clone and setup**:
```bash
cd AR_Project
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. **Start services**:
```bash
./dev.sh
```

This starts:
- Redis (localhost:6379)
- FastAPI backend (http://localhost:8000)
- 2 detection workers
- React frontend (http://localhost:3000)

3. **Set up Frontend**:
```bash
cd frontend
npm install
npm start
```

### Docker Setup

```bash
docker-compose up
```

Starts all services containerized with GPU support.

## Project Structure

```
AR_Project/
├── backend/                 # FastAPI WebSocket server
│   └── main.py              # Main server logic
├── workers/                 # YOLOv8 detection workers
│   └── detector.py          # Inference pipeline
├── frontend/                # React web application
│   ├── public/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── App.tsx          # Main app
│   │   └── index.tsx        # Entry point
│   └── package.json
├── training/                # YOLOv8 training pipeline
│   ├── train.py             # Training script
│   └── prepare_dataset.py   # Dataset preparation
├── models/                  # Trained model weights (git-ignored)
├── config/                  # Configuration files
├── requirements.txt         # Python dependencies
├── docker-compose.yml       # Multi-container orchestration
├── Dockerfile               # Container image
└── README.md
```

## Training Custom Model

### 1. Prepare Dataset

Organize your images and annotations:
```
dataset/
├── images/
│   ├── img1.jpg
│   ├── img2.jpg
│   └── ...
├── labels/
│   ├── img1.txt  (YOLO format: <class_id> <x_center> <y_center> <width> <height>)
│   └── ...
```

### 2. Create Dataset Config

```bash
python training/prepare_dataset.py \
  --images-dir dataset/images \
  --annotations-dir dataset/labels \
  --output-dir data/my_dataset \
  --classes "person,car,dog" \
  --train-ratio 0.7 \
  --val-ratio 0.15
```

### 3. Train Model

```bash
python training/train.py \
  --dataset data/my_dataset/dataset.yaml \
  --train
```

This will:
- Train YOLOv8m for 100 epochs
- Validate on each epoch
- Early stop if no improvement for 20 epochs
- Export to ONNX and TensorRT formats (20-30% speedup)
- Save best weights to `runs/detect/custom/weights/best.pt`

### 4. Deploy Model

Copy trained weights to `models/` directory:
```bash
cp runs/detect/custom/weights/best.pt models/best.pt
```

Update `.env`:
```
MODEL_PATH=models/best.pt
```

Restart services to load new model.

## API Endpoints

### WebSocket Endpoint
**`ws://localhost:8000/ws/stream`**

Client sends:
- Binary JPEG frame data

Server sends:
- JSON detection results:
  ```json
  {
    "frame_id": "client_id:0",
    "detections": [
      {
        "x": 100,
        "y": 200,
        "width": 150,
        "height": 200,
        "label": "person",
        "confidence": 0.95,
        "class_id": 0
      }
    ],
    "inference_time_ms": 22.5,
    "num_detections": 1,
    "status": "success"
  }
  ```

### Health Check
**`GET http://localhost:8000/health`**

Returns:
```json
{
  "status": "healthy",
  "redis": "connected",
  "queue_size": 0
}
```

### System Status
**`GET http://localhost:8000/status`**

Returns:
```json
{
  "queue_size": 5,
  "active_workers": 2,
  "active_clients": 1,
  "debug_mode": false
}
```

## Performance Tuning

### Expected Performance (RTX 4070)

| Model | Input | Inference | FPS | Notes |
|-------|-------|-----------|-----|-------|
| YOLOv8n | 640×640 | 3-5ms | 200+ | Nano, fastest |
| YOLOv8s | 640×640 | 8-12ms | 80-120 | Small |
| YOLOv8m | 640×640 | 15-25ms | 40-60 | Medium (recommended) |
| YOLOv8l | 640×640 | 30-50ms | 20-30 | Large, accurate |

### Real-world End-to-End Latency

At 20 FPS with 1080p streaming:
- Frame capture: ~3ms
- WebSocket transmission: ~10-30ms
- Inference: ~20ms (YOLOv8m)
- Canvas rendering: ~2ms
- **Total: ~35-55ms per frame = ~20 FPS**

### Optimization Strategies

1. **Downscale input**: Send 540p frames, resize for inference
2. **TensorRT export**: 20-30% speedup  
3. **INT8 quantization**: 2-3x speedup with minimal accuracy loss
4. **Batch processing**: Process 4-8 frames together
5. **Post-processing tuning**: Adjust `conf_thres` and `iou_thres`

## Configuration

Edit `.env` to customize:

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Backend
BACKEND_PORT=8000
DEBUG=false

# Model
MODEL_PATH=models/best.pt
CONFIDENCE_THRESHOLD=0.5

# Logging
LOG_LEVEL=INFO
```

## Debug Mode

Click the "🐛 Debug" button in the web UI to enable:
- Confidence scores on detections
- Bounding box coordinates
- Performance statistics
- FPS counter

## Troubleshooting

### WebSocket Connection Failed
- Ensure backend is running: `http://localhost:8000/health`
- Check CORS configuration in `backend/main.py`
- Verify Redis is running: `redis-cli ping` → should return `PONG`

### GPU Not Detected
```bash
python -c "import torch; print(torch.cuda.is_available())"
```
Should return `True`. If not:
- Verify NVIDIA GPU drivers: `nvidia-smi`
- Install PyTorch with CUDA support: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121`

### Slow Inference
- Check GPU utilization: `nvidia-smi` (should be >80%)
- Verify TensorRT export if available
- Monitor Redis queue size: `redis-cli DBSIZE`

### Model Not Loading
- Verify `MODEL_PATH` in `.env`
- Check file exists: `ls -la models/best.pt`
- Check permissions: `sudo chmod 644 models/best.pt`

## Production Deployment

### Using Docker

```bash
docker-compose -f docker-compose.yml --profile prod up
```

### Using Systemd

Create `/etc/systemd/system/ar-detection.service`:
```ini
[Unit]
Description=AR Object Detection Service
After=network.target

[Service]
Type=simple
User=ar-user
WorkingDirectory=/opt/ar_project
ExecStart=/opt/ar_project/start_production.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Start the service:
```bash
sudo systemctl start ar-detection
sudo systemctl enable ar-detection
```

### Scaling Workers

Increase worker instances by editing `docker-compose.yml`:
```yaml
deploy:
  replicas: 4  # Run 4 workers instead of 2
```

Or manually:
```bash
for i in {1..4}; do
  rq worker -u redis://localhost:6379/0 --with-scheduler &
done
```

## Development Workflow

1. **Make changes** to backend/workers
2. **Restart services**: `./dev.sh`
3. **Test in browser**: http://localhost:3000
4. **Check logs**: Look for errors in terminal

For frontend changes, React auto-reloads on save.

## License

This project is provided as-is for development and research purposes.

## Support

For issues or questions, check:
1. `.env` configuration
2. Backend logs: `python backend/main.py`
3. Worker logs: `rq worker ...` output
4. Browser console (Ctrl+Shift+J in Chrome)
