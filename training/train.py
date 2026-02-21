"""
YOLOv8 Custom Model Training Pipeline

This script handles:
1. Dataset preparation and validation
2. Model training with custom hyperparameters
3. Model validation and metrics
4. Export to ONNX and TensorRT formats
"""

import os
import argparse
import logging
from pathlib import Path

from ultralytics import YOLO
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Load environment
load_dotenv()

# Configuration
MODEL_ARCHITECTURE = "n"  # nano, small, medium, large
EPOCHS = 50
BATCH_SIZE = 8
PATIENCE = 20  # Early stopping
IMG_SIZE = 640
DEVICE = 0  # GPU index
WORKERS = 8


def validate_dataset(dataset_yaml: str) -> bool:
    """Validate dataset.yaml file and directory structure."""
    logger.info(f"Validating dataset configuration: {dataset_yaml}")

    if not os.path.exists(dataset_yaml):
        logger.error(f"Dataset YAML not found: {dataset_yaml}")
        return False

    # Parse YAML
    import yaml

    with open(dataset_yaml, "r") as f:
        config = yaml.safe_load(f)

    required_keys = ["path", "train", "val", "test", "nc", "names"]
    missing_keys = [k for k in required_keys if k not in config]
    if missing_keys:
        logger.error(f"Missing keys in dataset.yaml: {missing_keys}")
        return False

    # Check directories exist
    dataset_root = Path(config["path"])
    train_dir = dataset_root / config["train"]
    val_dir = dataset_root / config["val"]

    if not train_dir.exists():
        logger.error(f"Training directory not found: {train_dir}")
        return False

    if not val_dir.exists():
        logger.error(f"Validation directory not found: {val_dir}")
        return False

    logger.info(f"✓ Dataset validated successfully")
    logger.info(f"  - Classes: {config['nc']} ({config['names']})")
    logger.info(f"  - Training: {train_dir}")
    logger.info(f"  - Validation: {val_dir}")

    return True


def train(dataset_yaml: str, resume: bool = False) -> str:
    """
    Train YOLOv8 model on custom dataset.

    Args:
        dataset_yaml: Path to dataset.yaml file
        resume: Resume training from last checkpoint

    Returns:
        Path to best model weights
    """
    logger.info("Starting YOLOv8 training...")
    logger.info(f"Architecture: YOLOv8{MODEL_ARCHITECTURE}")
    logger.info(
        f"Config: {EPOCHS} epochs, batch_size={BATCH_SIZE}, patience={PATIENCE}"
    )

    # Load base model
    model = YOLO(f"yolov8{MODEL_ARCHITECTURE}.pt")
    logger.info(f"✓ Loaded base model")

    # Train
    results = model.train(
        data=dataset_yaml,
        epochs=EPOCHS,
        imgsz=IMG_SIZE,
        device=DEVICE,
        batch=BATCH_SIZE,
        patience=PATIENCE,
        workers=WORKERS,
        project="runs/detect",
        name="custom",
        exist_ok=True,
        resume=resume,
        close_mosaic=10,  # Turn off mosaic augmentation for final 10 epochs
        mosaic=1.0,
        augment=True,
        save=True,
        save_period=10,
        val=True,
        verbose=True,
        seed=42,
    )

    best_weights = Path(results.save_dir) / "weights" / "best.pt"
    logger.info(f"✓ Training complete!")
    logger.info(f"✓ Best weights saved: {best_weights}")

    return str(best_weights)


def validate(weights: str, dataset_yaml: str) -> dict:
    """
    Validate trained model on validation set.

    Args:
        weights: Path to model weights
        dataset_yaml: Path to dataset.yaml

    Returns:
        Dictionary of validation metrics
    """
    logger.info(f"Validating model: {weights}")

    model = YOLO(weights)
    results = model.val(data=dataset_yaml, device=DEVICE, imgsz=IMG_SIZE, verbose=True)

    logger.info(f"✓ Validation complete!")
    logger.info(f"  - mAP50: {results.box.map50:.3f}")
    logger.info(f"  - mAP50-95: {results.box.map:.3f}")

    return {
        "map50": float(results.box.map50),
        "map": float(results.box.map),
    }


def export_onnx(weights: str, output_dir: str = "models") -> str:
    """
    Export model to ONNX format.

    Args:
        weights: Path to model weights
        output_dir: Directory to save ONNX model

    Returns:
        Path to exported ONNX model
    """
    logger.info(f"Exporting to ONNX: {weights}")

    model = YOLO(weights)
    onnx_path = model.export(format="onnx", imgsz=IMG_SIZE, device=DEVICE, opset=12)

    logger.info(f"✓ ONNX export complete: {onnx_path}")
    return str(onnx_path)


def export_tensorrt(weights: str, output_dir: str = "models") -> str:
    """
    Export model to TensorRT format (requires CUDA).

    Args:
        weights: Path to model weights
        output_dir: Directory to save TensorRT model

    Returns:
        Path to exported TensorRT model
    """
    logger.info(f"Exporting to TensorRT: {weights}")

    try:
        model = YOLO(weights)
        trt_path = model.export(
            format="engine",
            imgsz=IMG_SIZE,
            device=DEVICE,
            half=True,  # FP16 precision for faster inference
            workspace=4,  # 4GB workspace
        )

        logger.info(f"✓ TensorRT export complete: {trt_path}")
        logger.info(f"  Expect 20-30% speedup over PyTorch")
        return str(trt_path)

    except Exception as e:
        logger.error(f"✗ TensorRT export failed (requires NVIDIA GPU): {e}")
        logger.info("Skipping TensorRT export. Use PyTorch model instead.")
        return None


def export_all(weights: str, output_dir: str = "models") -> dict:
    """Export model to all supported formats."""
    os.makedirs(output_dir, exist_ok=True)

    exports = {
        "original": weights,
    }

    # Export ONNX
    try:
        exports["onnx"] = export_onnx(weights, output_dir)
    except Exception as e:
        logger.error(f"ONNX export failed: {e}")

    # Export TensorRT
    try:
        trt = export_tensorrt(weights, output_dir)
        if trt:
            exports["tensorrt"] = trt
    except Exception as e:
        logger.error(f"TensorRT export failed: {e}")

    logger.info("✓ Export complete!")
    for fmt, path in exports.items():
        logger.info(f"  - {fmt}: {path}")

    return exports


def main():
    parser = argparse.ArgumentParser(description="YOLOv8 Custom Training Pipeline")
    parser.add_argument(
        "--dataset", type=str, required=True, help="Path to dataset.yaml"
    )
    parser.add_argument("--train", action="store_true", help="Run training")
    parser.add_argument(
        "--validate", type=str, help="Validate model (provide weights path)"
    )
    parser.add_argument(
        "--export",
        type=str,
        help="Export model to ONNX/TensorRT (provide weights path)",
    )
    parser.add_argument(
        "--resume", action="store_true", help="Resume training from checkpoint"
    )

    args = parser.parse_args()

    if args.train:
        if not validate_dataset(args.dataset):
            logger.error("Dataset validation failed")
            return

        best_weights = train(args.dataset, resume=args.resume)
        validate(best_weights, args.dataset)
        export_all(best_weights)

    elif args.validate:
        validate(args.validate, args.dataset)

    elif args.export:
        export_all(args.export)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
