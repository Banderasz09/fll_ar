"""
Worker process for YOLOv8 object detection.
Listens to Redis job queue, performs inference, and publishes results via Redis pubsub.
"""

import json
import logging
import os
from io import BytesIO
from typing import List, Dict, Any

import cv2
import numpy as np
import redis
import torch
from ultralytics import YOLO
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
MODEL_PATH = os.getenv("MODEL_PATH", "models/best.pt")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.5))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Initialize Redis
redis_client = redis.Redis(
    host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=False
)

# Initialize YOLOv8 model (loaded once per worker)
logger.info(f"Loading YOLOv8 model from {MODEL_PATH}...")
try:
    model = YOLO(MODEL_PATH)
    logger.info(f"✓ Model loaded successfully")
except Exception as e:
    logger.error(f"✗ Failed to load model: {e}")
    raise


def decode_frame(frame_data: bytes) -> np.ndarray:
    """
    Decode JPEG frame data to numpy array.

    Args:
        frame_data: Binary JPEG data

    Returns:
        OpenCV image (BGR format)
    """
    nparr = np.frombuffer(frame_data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("Failed to decode frame")

    return frame


def run_inference(frame: np.ndarray) -> tuple[List[Dict[str, Any]], float]:
    """
    Run YOLOv8 inference on frame.

    Args:
        frame: OpenCV image (BGR)

    Returns:
        Tuple of (detections list, inference time in ms)
    """
    # Run inference
    results = model(frame, conf=CONFIDENCE_THRESHOLD, verbose=False)
    inference_time = results[0].speed["inference"]

    # Extract detections
    detections = []
    result = results[0]

    if result.boxes is not None:
        boxes = result.boxes.cpu()

        for box in boxes:
            # Get bounding box coordinates (xyxy format)
            x1, y1, x2, y2 = box.xyxy[0].numpy().astype(int)
            x, y, w, h = x1, y1, (x2 - x1), (y2 - y1)

            # Get class label and confidence
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            class_name = model.names[class_id]

            detections.append(
                {
                    "x": int(x),
                    "y": int(y),
                    "width": int(w),
                    "height": int(h),
                    "label": class_name,
                    "confidence": round(confidence, 3),
                    "class_id": int(class_id),
                }
            )

    return detections, inference_time


def detect_objects(
    frame_id: str, frame_key: str, client_id: str, result_channel: str
) -> Dict[str, Any]:
    """
    Main detection job function. Called by RQ worker.

    Args:
        frame_id: Unique frame identifier
        frame_key: Redis key where frame is stored
        client_id: Client identifier for result routing
        result_channel: Redis pubsub channel to publish results

    Returns:
        Job result metadata
    """
    try:
        logger.info(f"Processing frame {frame_id}")

        # Retrieve frame from Redis
        frame_data = redis_client.get(frame_key)
        if frame_data is None:
            logger.error(f"Frame {frame_id} not found in Redis")
            return {"status": "error", "message": "Frame not found"}

        # Decode frame
        frame = decode_frame(frame_data)
        logger.debug(f"Frame {frame_id} decoded: {frame.shape}")

        # Run inference
        detections, inference_time = run_inference(frame)
        logger.info(
            f"Frame {frame_id} inference complete: {len(detections)} objects detected in {inference_time:.1f}ms"
        )

        # Prepare result JSON
        result = {
            "frame_id": frame_id,
            "client_id": client_id,
            "detections": detections,
            "inference_time_ms": round(inference_time, 1),
            "num_detections": len(detections),
            "status": "success",
        }

        # Publish result to client-specific channel
        redis_client.publish(result_channel, json.dumps(result))
        logger.debug(f"Published results for {frame_id} to {result_channel}")

        # Cleanup: delete frame from Redis
        redis_client.delete(frame_key)

        # Clear GPU cache to prevent memory leaks
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return {"status": "success", "detections": len(detections)}

    except Exception as e:
        logger.error(f"Error processing frame {frame_id}: {e}", exc_info=True)

        # Send error result to client
        error_result = {
            "frame_id": frame_id,
            "client_id": client_id,
            "status": "error",
            "message": str(e),
        }
        redis_client.publish(result_channel, json.dumps(error_result))

        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    # For manual testing
    logger.info("Worker detector module loaded successfully")
