import os, csv, time
from datetime import datetime

import cv2
import numpy as np
import pyrealsense2 as rs
from insightface.app import FaceAnalysis

# ---------- SETTINGS ----------
DB_FILE = "embeddings.npz"
OUTPUT_CSV = "detections_log.csv"

SIM_THRESHOLD = 0.55          # raise to 0.60/0.65 if wrong matches
COOLDOWN_SECONDS = 10         # log same person once per 10 seconds

MIN_FACE_W = 60               # ignore tiny faces (bad recognition)
MIN_FACE_H = 60

RS_W, RS_H, RS_FPS = 640, 480, 30

# ---------- HELPERS ----------
def load_db(db_file):
    data = np.load(db_file, allow_pickle=True)
    names = data["names"].tolist()
    mean_embs = data["mean_embeddings"].astype(np.float32)  # (N,512)
    mean_embs = mean_embs / np.linalg.norm(mean_embs, axis=1, keepdims=True)
    return names, mean_embs

def cosine_similarity(a, B):
    # both normalized => cosine = dot product
    return B @ a

def ensure_csv_header(path):
    if not os.path.exists(path):
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp", "name", "similarity", "camera"])

def main():
    # 1) Load DB
    if not os.path.exists(DB_FILE):
        raise FileNotFoundError(f"❌ {DB_FILE} not found. Run enrollment to create it.")
    names, mean_embs = load_db(DB_FILE)
    print(f"✅ Loaded DB: {names}")

    # 2) InsightFace (RetinaFace + ArcFace embeddings)
    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
    )
    app.prepare(ctx_id=0, det_size=(640, 640))

    # 3) RealSense RGB stream
    pipeline = rs.pipeline()
    config = rs.config()
    config.enable_stream(rs.stream.color, RS_W, RS_H, rs.format.bgr8, RS_FPS)
    pipeline.start(config)
    time.sleep(1)

    # 4) CSV log
    ensure_csv_header(OUTPUT_CSV)
    last_logged_time = {}  # name -> epoch seconds

    print("✅ RealSense recognition running. Press 'q' to quit.")
    try:
        while True:
            frames = pipeline.wait_for_frames()
            cf = frames.get_color_frame()
            if not cf:
                continue

            frame = np.asanyarray(cf.get_data())

            # 5) Detect faces + embeddings
            faces = app.get(frame)

            for f in faces:
                x1, y1, x2, y2 = map(int, f.bbox)
                fw, fh = x2 - x1, y2 - y1
                if fw < MIN_FACE_W or fh < MIN_FACE_H:
                    continue

                emb = f.normed_embedding.astype(np.float32)
                emb = emb / (np.linalg.norm(emb) + 1e-12)

                sims = cosine_similarity(emb, mean_embs)
                best_i = int(np.argmax(sims))
                best_sim = float(sims[best_i])
                best_name = names[best_i]

                if best_sim >= SIM_THRESHOLD:
                    detected_name = best_name
                    label = f"{best_name} ({best_sim:.2f})"
                else:
                    detected_name = "Unknown"
                    label = f"Unknown ({best_sim:.2f})"

                # Draw
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(frame, label, (x1, max(20, y1 - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                # 6) Log (cooldown, and only for known people)
                now = time.time()
                last = last_logged_time.get(detected_name, 0)

                if detected_name != "Unknown" and (now - last >= COOLDOWN_SECONDS):
                    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    with open(OUTPUT_CSV, "a", newline="", encoding="utf-8") as fcsv:
                        writer = csv.writer(fcsv)
                        writer.writerow([ts, detected_name, f"{best_sim:.4f}", "realsense"])
                    last_logged_time[detected_name] = now
                    print(f"✅ Logged: {ts} | {detected_name} | sim={best_sim:.3f}")

            cv2.imshow("RealSense Face Recognition + Logging", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        pipeline.stop()
        cv2.destroyAllWindows()
        print(f"✅ Done. Log saved to: {OUTPUT_CSV}")

if __name__ == "__main__":
    main()
