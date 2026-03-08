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
import random
from pathlib import Path
from typing import List, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def split_and_copy_files(
    images_dir: str,
    annotations_dir: str,
    output_dir: str,
    train_ratio: float = 0.7,
    val_ratio: float = 0.2,
) -> Tuple[int, int, int]:
    """
    Split images and labels into train/val/test sets and copy them.

    Args:
        images_dir: Directory containing images
        annotations_dir: Directory containing label files
        output_dir: Output directory with train/val/test structure
        train_ratio: Proportion of data for training
        val_ratio: Proportion of data for validation

    Returns:
        Tuple of (train_count, val_count, test_count)
    """
    images_path = Path(images_dir)
    annotations_path = Path(annotations_dir)

    # Get all image files (support common formats)
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}
    image_files = [
        f
        for f in images_path.iterdir()
        if f.is_file() and f.suffix.lower() in image_extensions
    ]

    if not image_files:
        logger.error(f"No images found in {images_dir}")
        return 0, 0, 0

    logger.info(f"Found {len(image_files)} images")

    # Shuffle for random split
    random.shuffle(image_files)

    # Calculate split indices
    total = len(image_files)
    train_end = int(total * train_ratio)
    val_end = train_end + int(total * val_ratio)

    splits = {
        "train": image_files[:train_end],
        "val": image_files[train_end:val_end],
        "test": image_files[val_end:],
    }

    # Copy files to respective directories
    copied_counts = {"train": 0, "val": 0, "test": 0}

    for split_name, files in splits.items():
        for img_file in files:
            # Copy image
            dst_img = Path(output_dir) / "images" / split_name / img_file.name
            shutil.copy2(img_file, dst_img)

            # Find and copy corresponding label file
            label_file = annotations_path / f"{img_file.stem}.txt"
            if label_file.exists():
                dst_label = Path(output_dir) / "labels" / split_name / label_file.name
                shutil.copy2(label_file, dst_label)
                copied_counts[split_name] += 1
            else:
                logger.warning(f"Label not found for {img_file.name}")

    logger.info(f"✓ Split complete:")
    logger.info(f"  Train: {copied_counts['train']} images")
    logger.info(f"  Val: {copied_counts['val']} images")
    logger.info(f"  Test: {copied_counts['test']} images")

    return copied_counts["train"], copied_counts["val"], copied_counts["test"]


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

    # Split and copy images and labels
    split_and_copy_files(
        args.images_dir,
        args.annotations_dir,
        args.output_dir,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
    )

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
