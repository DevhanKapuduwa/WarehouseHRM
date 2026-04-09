import pyrealsense2 as rs
import numpy as np
import cv2
import time

def main():
    pipeline = rs.pipeline()
    config = rs.config()
    config.enable_stream(rs.stream.color, 640, 480, rs.format.bgr8, 30)

    pipeline.start(config)
    time.sleep(1)

    prev = time.time()
    fps = 0.0

    print("✅ RealSense RGB + FPS... Press 'q' to quit.")
    try:
        while True:
            frames = pipeline.wait_for_frames()
            color_frame = frames.get_color_frame()
            if not color_frame:
                continue

            img = np.asanyarray(color_frame.get_data())

            now = time.time()
            dt = now - prev
            prev = now
            fps = (1.0 / dt) if dt > 0 else 0.0

            cv2.putText(img, f"FPS: {fps:.1f}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)

            cv2.imshow("RealSense D435 - RGB FPS", img)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
    finally:
        pipeline.stop()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
