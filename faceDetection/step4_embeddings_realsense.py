import cv2
import numpy as np
import pyrealsense2 as rs
from ultralytics import YOLO
from insightface.app import FaceAnalysis

MODEL_NAME = "yolov8n.pt"
PERSON_CLASS_ID = 0
YOLO_CONF = 0.4

MIN_FACE_W = 40
MIN_FACE_H = 40

RS_W, RS_H, RS_FPS = 640, 480, 30


def clamp_box(x1, y1, x2, y2, w, h):
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(0, min(x2, w - 1))
    y2 = max(0, min(y2, h - 1))
    if x2 <= x1: x2 = min(w - 1, x1 + 1)
    if y2 <= y1: y2 = min(h - 1, y1 + 1)
    return x1, y1, x2, y2


def main():
    # 1) YOLO for person detection
    yolo = YOLO(MODEL_NAME)

    # 2) InsightFace: detection + alignment + recognition (ArcFace embeddings)
    # buffalo_l is the default pack that includes ArcFace
    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
    )
    app.prepare(ctx_id=0, det_size=(640, 640))

    # 3) RealSense RGB
    pipeline = rs.pipeline()
    config = rs.config()
    config.enable_stream(rs.stream.color, RS_W, RS_H, rs.format.bgr8, RS_FPS)
    pipeline.start(config)

    print("✅ Step 4 running: Face boxes + ArcFace embeddings. Press 'q' to quit.")
    try:
        while True:
            frames = pipeline.wait_for_frames()
            color_frame = frames.get_color_frame()
            if not color_frame:
                continue

            frame = np.asanyarray(color_frame.get_data())
            H, W = frame.shape[:2]

            # 4) YOLO persons
            results = yolo.predict(frame, conf=YOLO_CONF, verbose=False)

            for r in results:
                if r.boxes is None:
                    continue

                for b in r.boxes:
                    if int(b.cls[0]) != PERSON_CLASS_ID:
                        continue

                    px1, py1, px2, py2 = map(int, b.xyxy[0])
                    px1, py1, px2, py2 = clamp_box(px1, py1, px2, py2, W, H)

                    person_roi = frame[py1:py2, px1:px2]
                    if person_roi.size == 0:
                        continue

                    # 5) InsightFace finds faces + gives embeddings
                    faces = app.get(person_roi)

                    for f in faces:
                        fx1, fy1, fx2, fy2 = map(int, f.bbox)
                        fw, fh = fx2 - fx1, fy2 - fy1
                        if fw < MIN_FACE_W or fh < MIN_FACE_H:
                            continue

                        # Convert ROI coords -> global coords
                        gx1, gy1 = px1 + fx1, py1 + fy1
                        gx2, gy2 = px1 + fx2, py1 + fy2
                        gx1, gy1, gx2, gy2 = clamp_box(gx1, gy1, gx2, gy2, W, H)

                        # 6) Embedding vector (ArcFace)
                        emb = f.normed_embedding  # numpy array
                        # Usually 512 dims for ArcFace (buffalo_l)
                        emb_dim = emb.shape[0]

                        # Print embedding info (not every frame to avoid spam)
                        # Here: print when you detect a face
                        print(f"Embedding dim = {emb_dim}, first 5 values = {emb[:5]}")

                        # Draw face box
                        cv2.rectangle(frame, (gx1, gy1), (gx2, gy2), (0, 0, 255), 2)
                        cv2.putText(frame, f"emb:{emb_dim}", (gx1, gy1 - 8),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            cv2.imshow("Step 4 - Face Embeddings", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        pipeline.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
