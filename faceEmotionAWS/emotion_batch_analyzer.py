"""
emotion_batch_analyzer.py
=========================
Called by the Laravel backend to analyse ALL face photos stored for a
specific worker under:

    faceEmotionAWS/database/<worker_folder>/

Usage (from the command line or via shell_exec):
    python emotion_batch_analyzer.py <worker_folder_name>

Output: a single JSON object on stdout with this shape:
{
  "worker_folder": "devhan",
  "total_photos": 5,
  "analysed": 5,
  "errors": 0,
  "results": [
    {
      "photo": "devhan_2026-03-29_20-03-23.jpg",
      "photo_path": "...",
      "captured_at": "2026-03-29 20:03:23",   // parsed from filename
      "faces_detected": 1,
      "faces": [
        {
          "face_index": 1,
          "primary_emotion": "HAPPY",
          "primary_confidence": 98.5,
          "emotions": { "HAPPY": 98.5, "CALM": 1.2, ... },
          "age_range": { "low": 25, "high": 35 },
          "gender": { "value": "Male", "confidence": 99.1 },
          "smile": { "value": true, "confidence": 95.0 },
          "eyes_open": { "value": true, "confidence": 99.0 },
          "quality": { "brightness": 72.3, "sharpness": 85.1 },
          "pose": { "roll": -2.1, "yaw": 5.3, "pitch": -1.0 },
          "face_occluded": false
        }
      ],
      "error": null
    },
    ...
  ]
}

If an image fails analysis, its entry has "error": "<message>" and "faces": [].
"""

import os
import sys
import json
import re
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

# ── AWS credentials: set in Laravel .env (passed through the PHP process env) ─
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-south-1")

# ── Supported image extensions ───────────────────────────────────────────────
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# ── Database root (sibling of this script) ───────────────────────────────────
DATABASE_ROOT = Path(__file__).resolve().parent / "database"


def build_rekognition_client():
    """Retries + explicit region; credentials from env (set by Laravel before spawning this process)."""
    kwargs = {
        "region_name": AWS_REGION,
        "config": Config(
            retries={"max_attempts": 5, "mode": "standard"},
            connect_timeout=10,
            read_timeout=30,
        ),
    }
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
    return boto3.client("rekognition", **kwargs)


def analyse_image(client, image_path: Path) -> dict:
    """
    Run DetectFaces with ALL attributes on a single image.
    Returns a dict with keys: faces_detected, faces, error.
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        response = client.detect_faces(
            Image={"Bytes": image_bytes},
            Attributes=["ALL"],
        )

        face_details = []
        for idx, face in enumerate(response.get("FaceDetails", []), 1):
            emotions_raw = sorted(
                face.get("Emotions", []),
                key=lambda e: e["Confidence"],
                reverse=True,
            )
            emotions_map = {e["Type"]: round(e["Confidence"], 2) for e in emotions_raw}

            primary = emotions_raw[0] if emotions_raw else {}
            age     = face.get("AgeRange", {})
            gender  = face.get("Gender", {})
            smile   = face.get("Smile", {})
            eyes    = face.get("EyesOpen", {})
            quality = face.get("Quality", {})
            pose    = face.get("Pose", {})
            occ     = face.get("FaceOccluded", {})

            face_details.append({
                "face_index":          idx,
                "primary_emotion":     primary.get("Type", "UNKNOWN"),
                "primary_confidence":  round(primary.get("Confidence", 0.0), 2),
                "emotions":            emotions_map,
                "age_range":           {"low": age.get("Low", 0), "high": age.get("High", 0)},
                "gender":              {
                    "value":      gender.get("Value", "Unknown"),
                    "confidence": round(gender.get("Confidence", 0.0), 2),
                },
                "smile":               {
                    "value":      bool(smile.get("Value", False)),
                    "confidence": round(smile.get("Confidence", 0.0), 2),
                },
                "eyes_open":           {
                    "value":      bool(eyes.get("Value", False)),
                    "confidence": round(eyes.get("Confidence", 0.0), 2),
                },
                "quality":             {
                    "brightness": round(quality.get("Brightness", 0.0), 2),
                    "sharpness":  round(quality.get("Sharpness",  0.0), 2),
                },
                "pose":                {
                    "roll":  round(pose.get("Roll",  0.0), 2),
                    "yaw":   round(pose.get("Yaw",   0.0), 2),
                    "pitch": round(pose.get("Pitch", 0.0), 2),
                },
                "face_occluded":       bool(occ.get("Value", False)),
            })

        return {"faces_detected": len(face_details), "faces": face_details, "error": None}

    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code == "InvalidSignatureException" or "Signature expired" in str(exc):
            return {
                "faces_detected": 0,
                "faces": [],
                "error": (
                    "AWS signature expired (PC clock out of sync with AWS). "
                    "Windows: Settings → Time & language → Date & time → Sync now. "
                    "Then try again."
                ),
            }
        return {"faces_detected": 0, "faces": [], "error": f"AWS: {code or str(exc)}"}

    except Exception as exc:
        msg = str(exc)
        if "InvalidSignatureException" in msg or "Signature expired" in msg:
            return {
                "faces_detected": 0,
                "faces": [],
                "error": (
                    "AWS signature expired (PC clock out of sync). Sync system time, then try again."
                ),
            }
        return {"faces_detected": 0, "faces": [], "error": msg}


def parse_timestamp_from_filename(filename: str) -> str:
    """
    Try to extract a timestamp from filenames like:
        devhan_2026-03-29_20-03-23.jpg  →  2026-03-29 20:03:23
    Falls back to empty string if pattern not found.
    """
    # Match YYYY-MM-DD_HH-MM-SS anywhere in the name
    m = re.search(r"(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})", filename)
    if m:
        return f"{m.group(1)} {m.group(2)}:{m.group(3)}:{m.group(4)}"
    return ""


def main():
    if len(sys.argv) < 2:
        error = {"error": "Usage: python emotion_batch_analyzer.py <worker_folder_name_or_full_path>"}
        print(json.dumps(error))
        sys.exit(1)

    arg = sys.argv[1].strip()
    arg_path = Path(arg)

    # If the argument is a full/absolute path that exists, use it directly.
    # Otherwise treat it as a folder name inside DATABASE_ROOT.
    if arg_path.is_absolute() and arg_path.exists():
        worker_dir = arg_path
        worker_folder_name = arg_path.name
    elif (DATABASE_ROOT / arg).exists():
        worker_folder_name = arg
        worker_dir = DATABASE_ROOT / arg
    else:
        # Last attempt: treat as folder name even if it doesn't exist (will 404 below)
        worker_folder_name = arg_path.name if arg_path.name else arg
        worker_dir = DATABASE_ROOT / worker_folder_name

    if not worker_dir.exists() or not worker_dir.is_dir():
        result = {
            "worker_folder": worker_folder_name,
            "total_photos":  0,
            "analysed":      0,
            "errors":        0,
            "results":       [],
            "error":         f"Folder not found: {worker_dir}",
        }
        print(json.dumps(result))
        sys.exit(0)

    # Collect all image files, sorted by name (chronological for our naming scheme)
    image_files = sorted(
        [p for p in worker_dir.iterdir()
         if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS],
        key=lambda p: p.name,
    )

    if not image_files:
        result = {
            "worker_folder": worker_folder_name,
            "total_photos":  0,
            "analysed":      0,
            "errors":        0,
            "results":       [],
            "error":         None,
        }
        print(json.dumps(result))
        sys.exit(0)

    client = build_rekognition_client()

    results   = []
    error_cnt = 0

    for img_path in image_files:
        analysis = analyse_image(client, img_path)

        if analysis["error"]:
            error_cnt += 1

        results.append({
            "photo":           img_path.name,
            "photo_path":      str(img_path),
            "captured_at":     parse_timestamp_from_filename(img_path.name),
            "faces_detected":  analysis["faces_detected"],
            "faces":           analysis["faces"],
            "error":           analysis["error"],
        })

    output = {
        "worker_folder": worker_folder_name,
        "total_photos":  len(image_files),
        "analysed":      len(image_files) - error_cnt,
        "errors":        error_cnt,
        "results":       results,
        "error":         None,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
