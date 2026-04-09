import cv2
import numpy as np
import pyrealsense2 as rs
from ultralytics import YOLO
from insightface.app import FaceAnalysis

# ----- SETTINGS -----
MODEL_NAME = "yolov8n.pt"      # person detection model
PERSON_CLASS_ID = 0           # COCO person id
YOLO_CONF = 0.4               # person detection threshold

MIN_FACE_W = 40               # ignore faces smaller than this width (px)
MIN_FACE_H = 40               # ignore faces smaller than this height (px)

# RealSense color stream settings
RS_W, RS_H, RS_FPS = 640, 480, 30


def clamp_box(x1, y1, x2, y2, w, h):
    """Clamp coordinates to image boundaries."""
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(0, min(x2, w - 1))
    y2 = max(0, min(y2, h - 1))
    # ensure proper ordering
    if x2 <= x1: x2 = min(w - 1, x1 + 1)
    if y2 <= y1: y2 = min(h - 1, y1 + 1)
    return x1, y1, x2, y2


def main():
    # 1) Load YOLO
    yolo = YOLO(MODEL_NAME)

    # 2) Setup InsightFace RetinaFace detector
    # providers: GPU first (if available), else CPU
    face_app = FaceAnalysis(providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    face_app.prepare(ctx_id=0, det_size=(640, 640))  # det_size can be (640,640) or (320,320)

    # 3) Start RealSense RGB stream
    pipeline = rs.pipeline()
    config = rs.config()
    config.enable_stream(rs.stream.color, RS_W, RS_H, rs.format.bgr8, RS_FPS)
    pipeline.start(config)

    print("✅ Step 3 running (YOLO person -> RetinaFace on person crop). Press 'q' to quit.")

    try:
        while True:
            frames = pipeline.wait_for_frames()
            color_frame = frames.get_color_frame()
            if not color_frame:
                continue

            frame = np.asanyarray(color_frame.get_data())
            H, W = frame.shape[:2]

            # 4) YOLO person detection
            results = yolo.predict(frame, conf=YOLO_CONF, verbose=False)

            # 5) For each person box -> crop -> run face detection
            for r in results:
                if r.boxes is None:
                    continue

                for box in r.boxes:
                    cls = int(box.cls[0])
                    if cls != PERSON_CLASS_ID:
                        continue

                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    x1, y1, x2, y2 = clamp_box(x1, y1, x2, y2, W, H)

                    # Draw the person box (optional, helps debugging)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

                    # ---- Person ROI (crop) ----
                    person_roi = frame[y1:y2, x1:x2]
                    if person_roi.size == 0:
                        continue

                    # 6) Run RetinaFace on the person ROI
                    # InsightFace expects BGR image (OpenCV format) -> we're already BGR.
                    faces = face_app.get(person_roi)

                    # 7) Draw face boxes (convert ROI coords -> full frame coords)
                    for f in faces:
                        # f.bbox = [x1, y1, x2, y2] inside the ROI
                        fx1, fy1, fx2, fy2 = map(int, f.bbox)

                        face_w = fx2 - fx1
                        face_h = fy2 - fy1

                        # Reject tiny faces (important for accuracy)
                        if face_w < MIN_FACE_W or face_h < MIN_FACE_H:
                            continue

                        # Convert ROI coords to full-frame coords
                        gx1 = x1 + fx1
                        gy1 = y1 + fy1
                        gx2 = x1 + fx2
                        gy2 = y1 + fy2

                        gx1, gy1, gx2, gy2 = clamp_box(gx1, gy1, gx2, gy2, W, H)

                        # Draw face box (red)
                        cv2.rectangle(frame, (gx1, gy1), (gx2, gy2), (0, 0, 255), 2)
                        cv2.putText(frame, "face", (gx1, gy1 - 8),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            cv2.imshow("Step 3 - Person + Face Boxes", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        pipeline.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
