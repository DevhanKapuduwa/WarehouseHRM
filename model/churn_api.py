"""
FastAPI churn prediction service.

Loads the trained `churn_model.joblib` bundle once at startup and serves
predictions via POST /predict (single employee) and POST /predict-batch
(list of employees).  Laravel calls this from ChurnController.

Usage:
    pip install fastapi uvicorn
    uvicorn churn_api:app --host 0.0.0.0 --port 8001 --reload
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Model bundle path ──────────────────────────────────────────────────────
MODEL_PATH = Path(__file__).resolve().parent / "artifacts" / "churn_model.joblib"

app = FastAPI(title="Employee Churn API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Loaded once at startup ─────────────────────────────────────────────────
_bundle: dict[str, Any] | None = None


@app.on_event("startup")
def _load_model() -> None:
    global _bundle
    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Model not found at {MODEL_PATH}. "
            "Run `python train_churn_model.py` first."
        )
    _bundle = joblib.load(MODEL_PATH)
    print(f"[churn_api] Model loaded from {MODEL_PATH}")
    print(f"[churn_api] Threshold: {_bundle['threshold']:.4f}")


# ── Input / output schemas ─────────────────────────────────────────────────

class EmployeeFeatures(BaseModel):
    """
    The 21 fields the model expects.
    All 'nullable' fields have sensible defaults so that Laravel can pass
    null for missing data without raising a validation error.
    """
    # Identifiers (passed through, not fed to model)
    employee_id:  str | None = Field(None, description="DB / HR identifier – echoed in response")
    name:         str | None = Field(None, description="Employee name – echoed in response")

    # Ordinal categoricals
    work_life_balance: str | None = Field(None, description="Poor | Average | Good | Excellent")
    education_level:   str | None = Field(None, description="High School | Bachelor's | Master's | PhD")

    # Nominal categoricals (one-hot internally)
    gender:         str | None = Field(None, description="Male | Female | Other")
    marital_status: str | None = Field(None, description="Single | Married | Divorced")
    job_role:       str | None = Field(None)
    department:     str | None = Field(None)
    work_location:  str | None = Field(None, description="Office | Remote | Hybrid")

    # Numeric features
    age:                        float | None = Field(None)
    tenure:                     float | None = Field(None, description="Years at company")
    salary:                     float | None = Field(None)
    performance_rating:         float | None = Field(None, description="1–5")
    projects_completed:         float | None = Field(None)
    training_hours:             float | None = Field(None)
    promotions:                 float | None = Field(None)
    overtime_hours:             float | None = Field(None)
    satisfaction_level:         float | None = Field(None, description="0–1 or 0–100; pass as-is")
    average_monthly_hours_worked: float | None = Field(None)
    absenteeism:                float | None = Field(None)
    distance_from_home:         float | None = Field(None)
    manager_feedback_score:     float | None = Field(None, description="0–10")


class PredictionResult(BaseModel):
    employee_id: str | None
    name:        str | None
    churn_prob:  float
    churn_pred:  int   # 0 = stay, 1 = churn
    risk_label:  str  # Low / Medium / High


class BatchRequest(BaseModel):
    employees: list[EmployeeFeatures]


class BatchResponse(BaseModel):
    threshold: float
    results:   list[PredictionResult]


# ── Helpers ────────────────────────────────────────────────────────────────

# Map from our snake_case API names → the column names training expects
_COL_MAP = {
    "work_life_balance":            "Work-Life Balance",
    "education_level":              "Education Level",
    "gender":                       "Gender",
    "marital_status":               "Marital Status",
    "job_role":                     "Job Role",
    "department":                   "Department",
    "work_location":                "Work Location",
    "age":                          "Age",
    "tenure":                       "Tenure",
    "salary":                       "Salary",
    "performance_rating":           "Performance Rating",
    "projects_completed":           "Projects Completed",
    "training_hours":               "Training Hours",
    "promotions":                   "Promotions",
    "overtime_hours":               "Overtime Hours",
    "satisfaction_level":           "Satisfaction Level",
    "average_monthly_hours_worked": "Average Monthly Hours Worked",
    "absenteeism":                  "Absenteeism",
    "distance_from_home":           "Distance from Home",
    "manager_feedback_score":       "Manager Feedback Score",
}


def _to_dataframe(employees: list[EmployeeFeatures]) -> pd.DataFrame:
    rows = []
    for emp in employees:
        d = emp.model_dump()
        row: dict[str, Any] = {}
        for api_key, col_name in _COL_MAP.items():
            row[col_name] = d.get(api_key)  # None → NaN after DataFrame construction
        rows.append(row)
    return pd.DataFrame(rows)


def _risk_label(prob: float) -> str:
    if prob >= 0.65:
        return "High"
    if prob >= 0.40:
        return "Medium"
    return "Low"


def _predict(employees: list[EmployeeFeatures]) -> BatchResponse:
    if _bundle is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    pipe  = _bundle["pipeline"]
    thr   = float(_bundle["threshold"])
    df    = _to_dataframe(employees)

    probas = pipe.predict_proba(df)[:, 1]
    preds  = (probas >= thr).astype(int)

    results = []
    for emp, prob, pred in zip(employees, probas, preds):
        results.append(
            PredictionResult(
                employee_id=emp.employee_id,
                name=emp.name,
                churn_prob=round(float(prob), 4),
                churn_pred=int(pred),
                risk_label=_risk_label(float(prob)),
            )
        )

    return BatchResponse(threshold=thr, results=results)


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": _bundle is not None,
        "threshold": float(_bundle["threshold"]) if _bundle else None,
    }


@app.post("/predict", response_model=BatchResponse)
def predict_single(employee: EmployeeFeatures) -> BatchResponse:
    """Predict churn for a single employee."""
    return _predict([employee])


@app.post("/predict-batch", response_model=BatchResponse)
def predict_batch(body: BatchRequest) -> BatchResponse:
    """Predict churn for a list of employees (used by Laravel)."""
    if not body.employees:
        raise HTTPException(status_code=422, detail="employees list is empty")
    return _predict(body.employees)


if __name__ == "__main__":
    uvicorn.run("churn_api:app", host="0.0.0.0", port=8001, reload=True)
