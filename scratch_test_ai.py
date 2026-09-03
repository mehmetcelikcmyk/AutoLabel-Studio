import cv2
import json
import numpy as np
from pathlib import Path
from ultralytics import YOLOWorld

img_path = Path("watch/watch_1235.jpg")
if not img_path.exists():
    print("File not found")
    exit()

img = cv2.imread(str(img_path))
h, w = img.shape[:2]
print(f"Image resolution: {w}x{h}")

model = YOLOWorld("yolov8s-worldv2.pt")
model.set_classes(["wristwatch", "wrist watch", "watch", "watch dial", "gold watch", "analog watch", "watch strap"])

for conf in [0.03, 0.05, 0.08, 0.15, 0.25]:
    for imgsz in [640, 960, 1280]:
        res = model.predict(img, conf=conf, imgsz=imgsz, verbose=False)[0]
        print(f"conf={conf:.2f}, imgsz={imgsz} -> {len(res.boxes)} raw detections")
