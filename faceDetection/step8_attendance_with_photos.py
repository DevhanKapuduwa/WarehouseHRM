"""
Step 8 — Robust Attendance + Photo Capture
==========================================
Identical to Step 7 with one extra feature:
  Every time a face is logged to the CSV (cooldown satisfied),
  a cropped face snapshot is saved to:

      ../faceEmotionAWS/database/<name>/<name>_<timestamp>.jpg

  Directory structure is created automatically if it does not exist.

Improvements inherited from Step 7:
  1. CLAHE + auto-gamma + bilateral denoise  → nighttime / low-light resilience
  2. 1280×720 + YOLOv8s + padded crops + upscale → longer detection range
  3. All-embedding matching + pose-adaptive threshold → angled faces
  4. Temporal voting tracker → confirms identity over multiple frames

New in Step 8:
  5. Photo snapshot on every attendance log → stored in faceEmotionAWS/database/
"""

import os, csv, time
from datetime import datetime
from collections import defaultdict, deque
from pathlib import Path

import cv2
import numpy as np
import pyrealsense2 as rs
from ultralytics import YOLO
from insightface.app import FaceAnalysis

# ──────────── SETTINGS ────────────
DB_FILE        = "embeddings.npz"
OUTPUT_CSV     = "detections_log.csv"
YOLO_MODEL     = "yolov8s.pt"
PERSON_CLASS   = 0
YOLO_CONF      = 0.3

# ── NEW: Photo snapshot output directory (relative to this script) ──
PHOTO_DB_DIR   = Path(__file__).resolve().parent.parent / "faceEmotionAWS" / "database"

# RealSense
RS_W, RS_H, RS_FPS = 1280, 720, 30

# Face size limits
MIN_FACE_W = 20
MIN_FACE_H = 20

# Upscale threshold
UPSCALE_MIN_HEIGHT = 250

# Crop padding
CROP_PAD_RATIO = 0.20

# Matching thresholds
BASE_SIM_THRESHOLD = 0.42
MILD_ANGLE_THRESH  = 0.39
HARD_ANGLE_THRESH  = 0.37

COOLDOWN_SECONDS   = 10

# Low-light enhancement
CLAHE_CLIP       = 4.0
CLAHE_GRID       = (8, 8)
DARK_BRIGHTNESS  = 100
GAMMA_VALUE      = 0.55
DENOISE_STRENGTH = 7

# Temporal voting tracker
TRACKER_WINDOW     = 8
TRACKER_MIN_VOTES  = 3
TRACKER_IOU_THRESH = 0.3

# ── NEW: Photo quality / padding ──
PHOTO_JPEG_QUALITY = 95          # JPEG quality 0-100
PHOTO_FACE_PAD_PX  = 30          # extra pixels around the face box in the snapshot


# ──────────── HELPERS ────────────

def clamp_box(x1, y1, x2, y2, w, h):
    """Clamp coordinates to image boundaries."""
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(0, min(x2, w - 1))
    y2 = max(0, min(y2, h - 1))
    if x2 <= x1: x2 = min(w - 1, x1 + 1)
    if y2 <= y1: y2 = min(h - 1, y1 + 1)
    return x1, y1, x2, y2


def enhance_low_light(frame):
    """
    Apply CLAHE on the luminance channel (LAB).
    If the frame is very dark, also apply gamma correction.
    Then apply bilateral denoising to reduce low-light noise.
    Returns: enhanced BGR frame, mean brightness (0-255), gamma_applied flag.
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)

    mean_brightness = float(l_chan.mean())

    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP, tileGridSize=CLAHE_GRID)
    l_chan = clahe.apply(l_chan)

    gamma_applied = False
    if mean_brightness < DARK_BRIGHTNESS:
        inv_gamma = 1.0 / GAMMA_VALUE
        table = np.array([
            ((i / 255.0) ** inv_gamma) * 255
            for i in range(256)
        ], dtype=np.uint8)
        l_chan = cv2.LUT(l_chan, table)
        gamma_applied = True

    enhanced = cv2.merge([l_chan, a_chan, b_chan])
    enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)

    enhanced = cv2.bilateralFilter(
        enhanced,
        d=DENOISE_STRENGTH,
        sigmaColor=75,
        sigmaSpace=75
    )

    return enhanced, mean_brightness, gamma_applied


def load_db(db_file):
    """Load the face database (names + all individual embeddings)."""
    data = np.load(db_file, allow_pickle=True)
    names = data["names"].tolist()
    all_embs = data["all_embeddings"]
    mean_embs = data["mean_embeddings"].astype(np.float32)
    mean_embs = mean_embs / (np.linalg.norm(mean_embs, axis=1, keepdims=True) + 1e-12)

    all_normed = []
    for person_embs in all_embs:
        pe = person_embs.astype(np.float32)
        norms = np.linalg.norm(pe, axis=1, keepdims=True) + 1e-12
        all_normed.append(pe / norms)

    return names, mean_embs, all_normed


def match_all_embeddings(query_emb, names, all_normed):
    """
    Compare query against EVERY individual enrollment embedding.
    Returns: (best_name, best_similarity)
    """
    best_sim = -1.0
    best_name = "Unknown"
    for i, (name, embs) in enumerate(zip(names, all_normed)):
        sims = embs @ query_emb
        max_sim = float(sims.max())
        if max_sim > best_sim:
            best_sim = max_sim
            best_name = name
    return best_name, best_sim


def get_adaptive_threshold(face):
    """
    Use InsightFace pose estimation (yaw, pitch, roll) to decide
    how strict the similarity threshold should be.
    """
    try:
        pose = face.pose
        pitch, yaw, roll = float(pose[0]), float(pose[1]), float(pose[2])
    except Exception:
        return BASE_SIM_THRESHOLD, 0.0, 0.0

    abs_yaw   = abs(yaw)
    abs_pitch = abs(pitch)

    if abs_yaw > 30 or abs_pitch > 25:
        return HARD_ANGLE_THRESH, yaw, pitch
    elif abs_yaw > 15 or abs_pitch > 15:
        return MILD_ANGLE_THRESH, yaw, pitch
    else:
        return BASE_SIM_THRESHOLD, yaw, pitch


def ensure_csv_header(path):
    if not os.path.exists(path):
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp", "name", "similarity", "camera", "photo_path"])


def upscale_crop(crop, target_height):
    """Bicubic upscale a crop so its height reaches target_height."""
    h, w = crop.shape[:2]
    if h >= target_height or h == 0:
        return crop
    scale = target_height / h
    new_w = int(w * scale)
    return cv2.resize(crop, (new_w, target_height), interpolation=cv2.INTER_CUBIC)


def pad_person_box(x1, y1, x2, y2, W, H, pad_ratio):
    """Expand a person bounding box by pad_ratio on each side, clamped to image bounds."""
    bw = x2 - x1
    bh = y2 - y1
    pad_x = int(bw * pad_ratio)
    pad_y = int(bh * pad_ratio)
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(W - 1, x2 + pad_x)
    y2 = min(H - 1, y2 + pad_y)
    return x1, y1, x2, y2


def compute_iou(boxA, boxB):
    """Compute Intersection-over-Union between two (x1,y1,x2,y2) boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


# ──────────── NEW: PHOTO SAVE HELPER ────────────

def save_attendance_photo(frame, face_box, name, timestamp_str, photo_db_dir):
    """
    Crop the face region (with padding) from frame and save it as JPEG.

    Parameters
    ----------
    frame        : full BGR frame
    face_box     : (gx1, gy1, gx2, gy2) in full-frame coordinates
    name         : detected person name (used as sub-folder and filename prefix)
    timestamp_str: e.g. "2026-03-29 20:03:23"
    photo_db_dir : pathlib.Path to the database root

    Returns
    -------
    str  : absolute path of saved image, or "" on failure
    """
    try:
        H, W = frame.shape[:2]
        gx1, gy1, gx2, gy2 = face_box
        pad = PHOTO_FACE_PAD_PX

        # Expand crop by PHOTO_FACE_PAD_PX on every side
        cx1 = max(0, gx1 - pad)
        cy1 = max(0, gy1 - pad)
        cx2 = min(W - 1, gx2 + pad)
        cy2 = min(H - 1, gy2 + pad)

        face_crop = frame[cy1:cy2, cx1:cx2]
        if face_crop.size == 0:
            # Fallback: save full frame
            face_crop = frame

        # Per-person sub-folder: database/<name>/
        person_dir = photo_db_dir / name
        person_dir.mkdir(parents=True, exist_ok=True)

        # Filename: <name>_YYYY-MM-DD_HH-MM-SS.jpg
        safe_ts = timestamp_str.replace(":", "-").replace(" ", "_")
        filename = f"{name}_{safe_ts}.jpg"
        filepath = person_dir / filename

        cv2.imwrite(
            str(filepath),
            face_crop,
            [cv2.IMWRITE_JPEG_QUALITY, PHOTO_JPEG_QUALITY]
        )
        return str(filepath)

    except Exception as e:
        print(f"⚠️  Photo save error: {e}")
        return ""


# ──────────── TEMPORAL VOTING TRACKER ────────────

class FaceTracker:
    """
    Tracks faces across frames and accumulates identity votes.
    Each tracked face has a sliding window of recent name votes.
    If a name appears >= TRACKER_MIN_VOTES times in the window,
    the identity is confirmed — even if individual frames are borderline.
    """

    def __init__(self, window_size=TRACKER_WINDOW, min_votes=TRACKER_MIN_VOTES,
                 iou_thresh=TRACKER_IOU_THRESH):
        self.window_size = window_size
        self.min_votes = min_votes
        self.iou_thresh = iou_thresh
        self.tracks = {}
        self.next_id = 0
        self.frame_num = 0

    def update(self, detections):
        self.frame_num += 1
        used_tracks = set()
        results = []

        detections_sorted = sorted(detections, key=lambda d: d["raw_sim"], reverse=True)

        for det in detections_sorted:
            box = det["box"]

            best_tid = None
            best_iou = 0.0
            for tid, track in self.tracks.items():
                if tid in used_tracks:
                    continue
                iou = compute_iou(box, track["box"])
                if iou > best_iou and iou >= self.iou_thresh:
                    best_iou = iou
                    best_tid = tid

            if best_tid is not None:
                tid = best_tid
                used_tracks.add(tid)
                self.tracks[tid]["box"] = box
                self.tracks[tid]["last_seen"] = self.frame_num
                self.tracks[tid]["votes"].append(det["raw_name"])
            else:
                tid = self.next_id
                self.next_id += 1
                used_tracks.add(tid)
                self.tracks[tid] = {
                    "box": box,
                    "votes": deque(maxlen=self.window_size),
                    "last_seen": self.frame_num,
                }
                self.tracks[tid]["votes"].append(det["raw_name"])

            vote_counts = defaultdict(int)
            for v in self.tracks[tid]["votes"]:
                if v != "Unknown":
                    vote_counts[v] += 1

            confirmed = False
            confirmed_name = det["raw_name"]

            if vote_counts:
                top_name = max(vote_counts, key=vote_counts.get)
                top_count = vote_counts[top_name]

                if top_count >= self.min_votes:
                    confirmed_name = top_name
                    confirmed = True
                elif det["raw_name"] != "Unknown":
                    confirmed_name = det["raw_name"]
                    confirmed = False

            results.append({
                **det,
                "confirmed_name": confirmed_name,
                "confirmed": confirmed,
                "track_id": tid,
                "vote_count": vote_counts.get(confirmed_name, 0) if confirmed else 0,
            })

        stale = [tid for tid, t in self.tracks.items()
                 if self.frame_num - t["last_seen"] > 15]
        for tid in stale:
            del self.tracks[tid]

        return results


# ──────────── MAIN ────────────

def main():
    # ── Ensure photo database directory exists ──
    PHOTO_DB_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📁 Photo database directory: {PHOTO_DB_DIR}")

    # 1) Load face DB
    if not os.path.exists(DB_FILE):
        raise FileNotFoundError(f"❌ {DB_FILE} not found. Run step5 enrollment first.")
    names, mean_embs, all_normed = load_db(DB_FILE)
    print(f"✅ Loaded DB: {names}")

    # 2) YOLO for person detection
    yolo = YOLO(YOLO_MODEL)

    # 3) InsightFace (RetinaFace + ArcFace)
    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
    )
    app.prepare(ctx_id=0, det_size=(640, 640))

    # 4) RealSense @ 1280×720
    pipeline = rs.pipeline()
    config   = rs.config()
    config.enable_stream(rs.stream.color, RS_W, RS_H, rs.format.bgr8, RS_FPS)
    pipeline.start(config)
    time.sleep(1)

    # 5) CSV log  ← now includes photo_path column
    ensure_csv_header(OUTPUT_CSV)
    last_logged = {}   # name → epoch

    # 6) Temporal tracker
    tracker = FaceTracker()

    print("✅ Step 8 — Robust Attendance + Photo Capture running. Press 'q' to quit.")
    print("   Enhancements: CLAHE+Gamma+Denoise | YOLOv8s+Upscale+Padding | Pose-Adaptive + Temporal Voting")
    print("   📸 Photo snapshots saved to:", PHOTO_DB_DIR)

    try:
        while True:
            frames = pipeline.wait_for_frames()
            cf = frames.get_color_frame()
            if not cf:
                continue

            raw_frame = np.asanyarray(cf.get_data())

            # ── LOW-LIGHT ENHANCEMENT ──
            frame, brightness, gamma_applied = enhance_low_light(raw_frame)
            H, W = frame.shape[:2]

            frame_detections = []

            # ── YOLO PERSON DETECTION ──
            results = yolo.predict(frame, conf=YOLO_CONF, verbose=False)

            for r in results:
                if r.boxes is None:
                    continue

                for box in r.boxes:
                    if int(box.cls[0]) != PERSON_CLASS:
                        continue

                    px1, py1, px2, py2 = map(int, box.xyxy[0])
                    px1, py1, px2, py2 = clamp_box(px1, py1, px2, py2, W, H)

                    # ── PADDED CROP ──
                    ppx1, ppy1, ppx2, ppy2 = pad_person_box(px1, py1, px2, py2, W, H, CROP_PAD_RATIO)

                    cv2.rectangle(frame, (ppx1, ppy1), (ppx2, ppy2), (0, 200, 0), 1)

                    # ── CROP + UPSCALE ──
                    person_crop = frame[ppy1:ppy2, ppx1:ppx2]
                    if person_crop.size == 0:
                        continue

                    person_crop = upscale_crop(person_crop, UPSCALE_MIN_HEIGHT)

                    # ── FACE DETECTION + EMBEDDING ──
                    faces = app.get(person_crop)

                    if not faces and person_crop.shape[0] < 300:
                        person_crop_2x = upscale_crop(frame[ppy1:ppy2, ppx1:ppx2], 400)
                        faces = app.get(person_crop_2x)
                        if faces:
                            person_crop = person_crop_2x

                    crop_h, crop_w = person_crop.shape[:2]
                    scale_x = (ppx2 - ppx1) / crop_w
                    scale_y = (ppy2 - ppy1) / crop_h

                    for f in faces:
                        fx1, fy1, fx2, fy2 = map(int, f.bbox)
                        fw, fh = fx2 - fx1, fy2 - fy1
                        if fw < MIN_FACE_W or fh < MIN_FACE_H:
                            continue

                        gx1 = int(ppx1 + fx1 * scale_x)
                        gy1 = int(ppy1 + fy1 * scale_y)
                        gx2 = int(ppx1 + fx2 * scale_x)
                        gy2 = int(ppy1 + fy2 * scale_y)
                        gx1, gy1, gx2, gy2 = clamp_box(gx1, gy1, gx2, gy2, W, H)

                        # ── POSE-ADAPTIVE THRESHOLD ──
                        threshold, yaw, pitch = get_adaptive_threshold(f)

                        # ── ALL-EMBEDDING MATCHING ──
                        emb = f.normed_embedding.astype(np.float32)
                        emb = emb / (np.linalg.norm(emb) + 1e-12)

                        best_name, best_sim = match_all_embeddings(emb, names, all_normed)

                        raw_name = best_name if best_sim >= threshold else "Unknown"

                        frame_detections.append({
                            "box": (gx1, gy1, gx2, gy2),
                            "raw_name": raw_name,
                            "raw_sim": best_sim,
                            "threshold": threshold,
                            "yaw": yaw,
                            "pitch": pitch,
                        })

            # ── TEMPORAL VOTING ──
            tracked_results = tracker.update(frame_detections)

            face_count = 0
            for tr in tracked_results:
                gx1, gy1, gx2, gy2 = tr["box"]
                yaw = tr["yaw"]
                best_sim = tr["raw_sim"]

                if tr["confirmed"]:
                    detected_name = tr["confirmed_name"]
                    color = (0, 255, 0)
                    label = f"{detected_name} ({best_sim:.2f}, y={yaw:.0f}) ✓"
                elif tr["raw_name"] != "Unknown":
                    detected_name = tr["raw_name"]
                    color = (0, 200, 200)
                    label = f"{detected_name}? ({best_sim:.2f}, y={yaw:.0f})"
                else:
                    detected_name = "Unknown"
                    color = (0, 0, 255)
                    label = f"Unknown ({best_sim:.2f}, y={yaw:.0f})"

                cv2.rectangle(frame, (gx1, gy1), (gx2, gy2), color, 2)
                cv2.putText(frame, label, (gx1, max(20, gy1 - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

                face_count += 1

                # ── COOLDOWN LOGGING + PHOTO CAPTURE ──
                now = time.time()
                last = last_logged.get(detected_name, 0)
                if detected_name != "Unknown" and (now - last >= COOLDOWN_SECONDS):
                    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    status = "confirmed" if tr["confirmed"] else "tentative"

                    # ── NEW: Save face snapshot BEFORE writing CSV ──
                    photo_path = save_attendance_photo(
                        frame,                        # annotated frame
                        (gx1, gy1, gx2, gy2),        # face box
                        detected_name,
                        ts,
                        PHOTO_DB_DIR
                    )

                    with open(OUTPUT_CSV, "a", newline="", encoding="utf-8") as fcsv:
                        writer = csv.writer(fcsv)
                        writer.writerow([ts, detected_name,
                                         f"{best_sim:.4f}", "realsense", photo_path])

                    last_logged[detected_name] = now
                    print(f"✅ Logged ({status}): {ts} | {detected_name} "
                          f"| sim={best_sim:.3f} | yaw={yaw:.1f}°")
                    if photo_path:
                        print(f"   📸 Photo → {photo_path}")

            # ── HUD ──
            hud_bright = f"Bright: {brightness:.0f}"
            hud_gamma  = " [GAMMA]" if gamma_applied else ""
            hud_faces  = f"Faces: {face_count}"
            hud_tracks = f"Tracks: {len(tracker.tracks)}"
            cv2.putText(frame, f"{hud_bright}{hud_gamma} | {hud_faces} | {hud_tracks}",
                        (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

            cv2.imshow("Step 8 - Attendance + Photo Capture", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        pipeline.stop()
        cv2.destroyAllWindows()
        print(f"✅ Done. Log saved to: {OUTPUT_CSV}")
        print(f"📁 Photos saved to:  {PHOTO_DB_DIR}")


if __name__ == "__main__":
    main()
