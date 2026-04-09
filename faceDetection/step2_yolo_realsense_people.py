import cv2
import numpy as np
import pyrealsense2 as rs
from ultralytics import YOLO

MODEL_NAME = "yolov8n.pt"   # try yolov8n.pt if you want more FPS
PERSON_CLASS_ID = 0         # 'person' in COCO

def main():
    model = YOLO(MODEL_NAME)

    pipeline = rs.pipeline()
    config = rs.config()

    # RealSense RGB stream
    config.enable_stream(rs.stream.color, 640, 480, rs.format.bgr8, 30)

    pipeline.start(config)

    print("✅ YOLO + RealSense running... Press 'q' to quit.")
    try:
        while True:
            frames = pipeline.wait_for_frames()
            color_frame = frames.get_color_frame()
            if not color_frame:
                continue

            frame = np.asanyarray(color_frame.get_data())

            results = model.predict(frame, conf=0.4, verbose=False)

            for r in results:
                if r.boxes is None:
                    continue

                for box in r.boxes:
                    cls = int(box.cls[0])
                    if cls != PERSON_CLASS_ID:
                        continue

                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])

                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frame, f"person {conf:.2f}", (x1, y1 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

            cv2.imshow("Step 2 - YOLO Person Detection (RealSense)", frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    finally:
        pipeline.stop()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
