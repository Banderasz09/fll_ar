"""
Dataset preparation for YOLOv8 training.

This script helps convert datasets to YOLO format and organize them
for training. It expects:

1. A directory with images
2. A directory with annotations (in COCO or Pascal VOC format)

Output:
- Organized training/validation/test directories
- annotations.yaml pointing to the directories
"""

import os
import json
import shutil
import argparse
import logging
from pathlib import Path
from typing import List, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_dataset_yaml(
    output_dir: str,
    class_names: List[str],
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> str:
    """
    Create dataset.yaml file for YOLO training.

    Args:
        output_dir: Root directory containing train/val/test folders
        class_names: List of class names
        train_ratio: Proportion of data for training
        val_ratio: Proportion of data for validation

    Returns:
        Path to created dataset.yaml
    """
    test_ratio = 1.0 - train_ratio - val_ratio

    yaml_content = f"""# Dataset config for YOLOv8
path: {output_dir}
train: images/train
val: images/val
test: images/test

# Classes
nc: {len(class_names)}
names:
"""

    for i, name in enumerate(class_names):
        yaml_content += f"  {i}: {name}\n"

    yaml_path = Path(output_dir) / "dataset.yaml"
    with open(yaml_path, "w") as f:
        f.write(yaml_content)

    logger.info(f"✓ Created dataset.yaml: {yaml_path}")
    return str(yaml_path)


def main():
    parser = argparse.ArgumentParser(description="Prepare dataset for YOLOv8 training")
    parser.add_argument(
        "--images-dir", type=str, required=True, help="Directory with images"
    )
    parser.add_argument(
        "--annotations-dir", type=str, required=True, help="Directory with annotations"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        required=True,
        help="Output directory for organized dataset",
    )
    parser.add_argument(
        "--classes", type=str, required=True, help="Comma-separated class names"
    )
    parser.add_argument(
        "--train-ratio", type=float, default=0.7, help="Training set ratio"
    )
    parser.add_argument(
        "--val-ratio", type=float, default=0.15, help="Validation set ratio"
    )

    args = parser.parse_args()

    class_names = [c.strip() for c in args.classes.split(",")]

    logger.info(f"Preparing dataset...")
    logger.info(f"  Images: {args.images_dir}")
    logger.info(f"  Annotations: {args.annotations_dir}")
    logger.info(f"  Classes: {class_names}")

    # Create output directory structure
    for split in ["images", "labels"]:
        for subset in ["train", "val", "test"]:
            Path(args.output_dir, split, subset).mkdir(parents=True, exist_ok=True)

    # TODO: Add conversion logic for your specific annotation format
    # This is a template - customize based on your dataset format

    # Create dataset.yaml
    create_dataset_yaml(
        args.output_dir,
        class_names,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
    )

    logger.info(f"✓ Dataset preparation complete!")
    logger.info(
        f"Next: python training/train.py --dataset {args.output_dir}/dataset.yaml --train"
    )


if __name__ == "__main__":
    main()
