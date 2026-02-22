"""
FastAPI WebSocket server for real-time object detection streaming.
Handles incoming video frames from client, enqueues them to Redis for processing,
and sends detection results back via WebSocket.
"""

import asyncio
import json
import logging
import uuid
from typing import Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import redis
from rq import Queue
from dotenv import load_dotenv
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration from .env
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 8000))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Global state
redis_client = None
job_queue = None
active_connections: Set[WebSocket] = set()
client_result_channels: dict = {}  # Map client_id -> Redis pubsub channel


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app startup and shutdown."""
    global redis_client, job_queue

    # Startup
    logger.info("Starting FastAPI server...")
    try:
        redis_client = redis.Redis(
            host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=False
        )
        redis_client.ping()
        logger.info(f"✓ Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
    except redis.ConnectionError as e:
        logger.error(f"✗ Failed to connect to Redis: {e}")
        raise

    job_queue = Queue(connection=redis_client)
    logger.info(f"✓ Job queue initialized")

    yield

    # Shutdown
    logger.info("Shutting down FastAPI server...")
    if redis_client:
        redis_client.close()
    logger.info("✓ Redis connection closed")


# Initialize FastAPI app
app = FastAPI(
    title="Real-time Object Detection API",
    description="WebSocket API for streaming video frames and receiving detection results",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        redis_client.ping()
        return {
            "status": "healthy",
            "redis": "connected",
            "queue_size": len(job_queue.jobs),
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")


@app.get("/status")
async def get_status():
    """Get current system status."""
    try:
        queue_size = len(job_queue.jobs)
        active_workers = redis_client.keys("rq:worker:*")

        return {
            "queue_size": queue_size,
            "active_workers": len(active_workers),
            "active_clients": len(active_connections),
            "debug_mode": DEBUG,
        }
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(status_code=500, detail="Status check failed")


@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for bidirectional video frame streaming.

    Client sends:
    - Binary frame data (JPEG compressed image)

    Server sends:
    - JSON detection results: {frame_id, detections: [{x, y, w, h, label, confidence}]}
    """
    client_id = str(uuid.uuid4())[:8]
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(
        f"Client {client_id} connected. Active connections: {len(active_connections)}"
    )

    # Create a dedicated result channel for this client
    pubsub = redis_client.pubsub()
    result_channel = f"detections:{client_id}"
    pubsub.subscribe(result_channel)
    client_result_channels[client_id] = (pubsub, result_channel)

    try:
        frame_count = 0

        # Start async task to listen for detection results
        async def listen_for_results():
            """Listen for detection results on Redis pubsub in a background task."""
            while True:
                try:
                    message = pubsub.get_message()
                    if message and message["type"] == "message":
                        detection_data = json.loads(message["data"])
                        await websocket.send_json(detection_data)
                        logger.debug(f"Sent detection result to {client_id}")
                    await asyncio.sleep(0.01)  # Prevent busy-waiting
                except Exception as e:
                    logger.error(f"Error listening for results: {e}")
                    break

        # Start the background listener task
        listener_task = asyncio.create_task(listen_for_results())

        # Main loop: receive frames from client
        while True:
            try:
                data = await websocket.receive_bytes()

                if not data:
                    logger.warning(f"Received empty frame from {client_id}")
                    continue

                frame_id = f"{client_id}:{frame_count}"
                frame_count += 1
                logger.info(f"Received frame {frame_id}, size: {len(data)} bytes")

                # Validate frame size (must be < 5MB)
                if len(data) > 5 * 1024 * 1024:
                    logger.warning(
                        f"Frame {frame_id} exceeds size limit: {len(data)} bytes"
                    )
                    continue

                # Store frame in Redis with TTL of 60 seconds
                frame_key = f"frame:{frame_id}"
                redis_client.setex(frame_key, 60, data)

                # Enqueue job to worker
                job = job_queue.enqueue(
                    "workers.detector.detect_objects",
                    frame_id=frame_id,
                    frame_key=frame_key,
                    client_id=client_id,
                    result_channel=result_channel,
                    job_timeout=10,
                )

                logger.info(f"Enqueued job {job.id} for frame {frame_id}")

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error receiving frame from {client_id}: {e}")
                break

    finally:
        # Cleanup
        active_connections.discard(websocket)

        # Cancel listener task
        if "listener_task" in locals():
            listener_task.cancel()

        # Cleanup Redis pubsub
        if client_id in client_result_channels:
            pubsub, _ = client_result_channels.pop(client_id)
            pubsub.unsubscribe()
            pubsub.close()

        logger.info(
            f"Client {client_id} disconnected. Active connections: {len(active_connections)}"
        )


@app.post("/detect")
async def detect_image(frame_id: str):
    """
    REST endpoint to trigger detection on a stored frame.
    Used for testing without WebSocket.
    """
    frame_key = f"frame:{frame_id}"

    if not redis_client.exists(frame_key):
        raise HTTPException(status_code=404, detail="Frame not found")

    client_id = "test"
    result_channel = f"detections:{client_id}"

    # Enqueue detection job
    job = job_queue.enqueue(
        "workers.detector.detect_objects",
        frame_id=frame_id,
        frame_key=frame_key,
        client_id=client_id,
        result_channel=result_channel,
        job_timeout=10,
    )

    return {"job_id": job.id, "frame_id": frame_id, "status": "queued"}


if __name__ == "__main__":
    import uvicorn

    ssl_cert_file = os.getenv("SSL_CERT_FILE")
    ssl_key_file = os.getenv("SSL_KEY_FILE")

    ssl_kwargs = {}
    if ssl_cert_file and ssl_key_file and os.path.isfile(ssl_cert_file) and os.path.isfile(ssl_key_file):
        ssl_kwargs = {
            "ssl_certfile": ssl_cert_file,
            "ssl_keyfile": ssl_key_file,
        }

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        reload=DEBUG,
        log_level="info",
        **ssl_kwargs,
    )
