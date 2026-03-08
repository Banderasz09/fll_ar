import fiftyone as fo

dataset = fo.Dataset.from_dir(
    dataset_dir="data/dataset2_yolo",
    dataset_type=fo.types.YOLOv5Dataset,
    label_field="ground_truth",
    yaml_path="dataset.yaml",
)

print("Samples loaded:", len(dataset))

session = fo.launch_app(dataset)
session.wait()
