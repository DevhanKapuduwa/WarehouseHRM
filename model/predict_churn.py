"""Score new rows with a saved churn_model.joblib bundle."""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", type=Path, default=Path(__file__).resolve().parent / "artifacts" / "churn_model.joblib")
    p.add_argument("--data", type=Path, required=True, help="CSV with same feature columns as training (no Churn needed)")
    p.add_argument("--out", type=Path, default=None, help="Write CSV with columns churn_proba, churn_pred")
    args = p.parse_args()

    bundle = joblib.load(args.model)
    pipe = bundle["pipeline"]
    thr = float(bundle["threshold"])

    df = pd.read_csv(args.data)
    drop = [c for c in ["Employee ID", "Churn"] if c in df.columns]
    X = df.drop(columns=drop, errors="ignore")
    proba = pipe.predict_proba(X)[:, 1]
    pred = (proba >= thr).astype(int)
    out = df.copy()
    out["churn_proba"] = proba
    out["churn_pred"] = pred
    if args.out:
        out.to_csv(args.out, index=False)
        print(f"Wrote {args.out}")
    else:
        print(out[["churn_proba", "churn_pred"]].describe())


if __name__ == "__main__":
    main()
