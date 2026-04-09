import os
import glob
import numpy as np
import cv2
from insightface.app import FaceAnalysis

DB_DIR = "faces_db"
OUT_FILE = "embeddings.npz"

# Reject low-quality tiny faces
MIN_FACE_W = 60
MIN_FACE_H = 60

def main():
    # InsightFace model pack (includes RetinaFace + ArcFace)
    app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    people = [p for p in os.listdir(DB_DIR) if os.path.isdir(os.path.join(DB_DIR, p))]
    if not people:
        raise RuntimeError(f"❌ No person folders found inside {DB_DIR}")

    db_mean = {}   # name -> mean embedding (512,)
    db_all = {}    # name -> all embeddings (N,512)

    for person in people:
        person_dir = os.path.join(DB_DIR, person)
        imgs = []
        for ext in ("*.jpg", "*.jpeg", "*.png"):
            imgs.extend(glob.glob(os.path.join(person_dir, ext)))

        if not imgs:
            print(f"⚠️ No images found for {person}. Skipping.")
            continue

        embs = []
        for img_path in imgs:
            img = cv2.imread(img_path)
            if img is None:
                print(f"⚠️ Could not read {img_path}. Skipping.")
                continue

            faces = app.get(img)
            if not faces:
                print(f"⚠️ No face found in {img_path}. Skipping.")
                continue

            # Pick the largest face in the image
            faces_sorted = sorted(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                reverse=True
            )
            f = faces_sorted[0]
            x1, y1, x2, y2 = map(int, f.bbox)
            fw, fh = x2 - x1, y2 - y1

            if fw < MIN_FACE_W or fh < MIN_FACE_H:
                print(f"⚠️ Face too small in {img_path} ({fw}x{fh}). Skipping.")
                continue

            emb = f.normed_embedding.astype(np.float32)  # (512,)
            embs.append(emb)

        if len(embs) == 0:
            print(f"❌ No valid embeddings for {person}. Add clearer images.")
            continue

        embs = np.stack(embs, axis=0)      # (N, 512)
        mean_emb = embs.mean(axis=0)
        mean_emb = mean_emb / np.linalg.norm(mean_emb)  # normalize mean

        db_all[person] = embs
        db_mean[person] = mean_emb

        print(f"✅ {person}: saved {embs.shape[0]} embeddings")

    # Save as NPZ (portable)
    # We save mean embeddings as arrays; all embeddings as object arrays
    np.savez(
        OUT_FILE,
        names=np.array(list(db_mean.keys())),
        mean_embeddings=np.stack(list(db_mean.values()), axis=0),
        all_embeddings=np.array([db_all[n] for n in db_mean.keys()], dtype=object)
    )

    print(f"\n✅ Database saved to: {OUT_FILE}")
    print("Contains:")
    print("- names")
    print("- mean_embeddings (recommended for fast matching)")
    print("- all_embeddings (optional, more detailed matching)")

if __name__ == "__main__":
    main()
