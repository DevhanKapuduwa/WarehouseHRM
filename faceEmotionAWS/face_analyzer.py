"""
Facial Expression Analyzer — Amazon Rekognition
================================================
Usage:
    1. Place your image in the same folder as this script (or any path)
    2. Set IMAGE_PATH below to your image filename
    3. Set your AWS credentials (see CONFIGURATION section)
    4. Run:  python rekognition_face_analyzer.py

Requirements:
    pip install boto3
"""

import boto3
import json
from pathlib import Path

# ─────────────────────────────────────────────
#  CONFIGURATION  ← edit these
# ─────────────────────────────────────────────

IMAGE_PATH = "devhan3.jpg"          # path to your image file

AWS_ACCESS_KEY_ID     = "AWS_ACCESS_KEY_ID"        # leave empty to use ~/.aws/credentials or env vars
AWS_SECRET_ACCESS_KEY = "AWS_SECRET_ACCESS_KEY"        # leave empty to use ~/.aws/credentials or env vars
AWS_REGION            = "ap-south-1"

# ─────────────────────────────────────────────


BAR_WIDTH = 28

EMOTION_ICONS = {
    "HAPPY":     "😊",
    "SAD":       "😢",
    "ANGRY":     "😠",
    "SURPRISED": "😲",
    "FEAR":      "😨",
    "DISGUSTED": "🤢",
    "CONFUSED":  "😕",
    "CALM":      "😐",
}


def bar(value: float, width: int = BAR_WIDTH) -> str:
    filled = int(round(value / 100 * width))
    return "█" * filled + "░" * (width - filled)


def analyze(image_path: str) -> dict:
    """Call Rekognition DetectFaces and return the raw response."""
    kwargs = dict(region_name=AWS_REGION)
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"]     = AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY

    client = boto3.client("rekognition", **kwargs)

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.detect_faces(
        Image={"Bytes": image_bytes},
        Attributes=["ALL"]          # ALL gives emotions, landmarks, quality, etc.
    )
    return response


def print_report(response: dict, image_path: str) -> None:
    W = 68
    faces = response.get("FaceDetails", [])

    print(f"\n{'═' * W}")
    print(f"  IMAGE  : {Path(image_path).name}")
    print(f"  FACES  : {len(faces)} detected")
    print(f"{'═' * W}")

    if not faces:
        print("  ⚠  No faces detected.")
        return

    for idx, face in enumerate(faces, 1):
        print(f"\n  ── FACE {idx} {'─' * (W - 10)}")

        # ── demographics ──────────────────────────────────
        age   = face.get("AgeRange", {})
        gender = face.get("Gender", {})
        print(f"\n  Demographics")
        print(f"    Age range  : {age.get('Low', '?')}–{age.get('High', '?')} years")
        print(f"    Gender     : {gender.get('Value', 'N/A')}  "
              f"({gender.get('Confidence', 0):.1f}% confidence)")

        # ── appearance ────────────────────────────────────
        def attr(key):
            d = face.get(key, {})
            val  = "Yes" if d.get("Value") else "No"
            conf = d.get("Confidence", 0)
            return f"{val}  ({conf:.1f}%)"

        print(f"\n  Appearance")
        print(f"    Smile      : {attr('Smile')}")
        print(f"    Beard      : {attr('Beard')}")
        print(f"    Mustache   : {attr('Mustache')}")
        print(f"    Eyeglasses : {attr('Eyeglasses')}")
        print(f"    Eyes open  : {attr('EyesOpen')}")
        print(f"    Mouth open : {attr('MouthOpen')}")

        # ── emotions ──────────────────────────────────────
        emotions = sorted(face.get("Emotions", []),
                          key=lambda e: e["Confidence"], reverse=True)
        print(f"\n  Emotions")
        for emo in emotions:
            t    = emo["Type"]
            conf = emo["Confidence"]
            icon = EMOTION_ICONS.get(t, "  ")
            b    = bar(conf)
            print(f"    {icon} {t:<12} {b}  {conf:>6.2f}%")

        primary = emotions[0] if emotions else {}
        print(f"\n  → Primary emotion : {primary.get('Type','?')}  "
              f"({primary.get('Confidence',0):.1f}% confidence)")

        # ── head pose ─────────────────────────────────────
        pose = face.get("Pose", {})
        print(f"\n  Head pose")
        print(f"    Roll   : {pose.get('Roll',  0):>7.2f}°")
        print(f"    Yaw    : {pose.get('Yaw',   0):>7.2f}°")
        print(f"    Pitch  : {pose.get('Pitch', 0):>7.2f}°")

        # ── eye direction ─────────────────────────────────
        eye = face.get("EyeDirection", {})
        if eye:
            print(f"\n  Eye direction")
            print(f"    Yaw    : {eye.get('Yaw',   0):>7.2f}°")
            print(f"    Pitch  : {eye.get('Pitch', 0):>7.2f}°")
            print(f"    Conf   : {eye.get('Confidence', 0):.1f}%")

        # ── image quality ─────────────────────────────────
        quality = face.get("Quality", {})
        print(f"\n  Image quality")
        print(f"    Brightness : {quality.get('Brightness', 0):.1f} / 100")
        print(f"    Sharpness  : {quality.get('Sharpness',  0):.1f} / 100")

        # ── bounding box ──────────────────────────────────
        bb = face.get("BoundingBox", {})
        print(f"\n  Bounding box")
        print(f"    Left {bb.get('Left',0):.3f}  Top {bb.get('Top',0):.3f}  "
              f"W {bb.get('Width',0):.3f}  H {bb.get('Height',0):.3f}")

        # ── occlusion & detection confidence ──────────────
        occ  = face.get("FaceOccluded", {})
        conf = face.get("Confidence", 0)
        print(f"\n  Face occluded  : {'Yes' if occ.get('Value') else 'No'}  "
              f"({occ.get('Confidence',0):.1f}%)")
        print(f"  Detection conf : {conf:.4f}%")
        print(f"\n  {'─' * (W - 2)}")

    print()


def save_json(response: dict, image_path: str) -> str:
    out = Path(image_path).with_suffix(".rekognition.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(response, f, indent=2)
    return str(out)


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    # Allow passing image path as command-line argument:
    #   python rekognition_face_analyzer.py myphoto.jpg
    path = sys.argv[1] if len(sys.argv) > 1 else IMAGE_PATH

    if not Path(path).exists():
        print(f"\n  ❌  File not found: {path}")
        print("  Set IMAGE_PATH in the script or pass the path as an argument.\n")
        sys.exit(1)

    print(f"\n  Sending '{path}' to Amazon Rekognition…")
    result = analyze(path)

    print_report(result, path)

    # Save raw JSON alongside the image
    json_out = save_json(result, path)
    print(f"  Raw JSON saved → {json_out}\n")