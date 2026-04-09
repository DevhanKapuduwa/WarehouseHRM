"""
Employee churn: preprocessing, SMOTE (train only), XGBoost + RandomizedSearchCV (ROC-AUC),
OOF threshold calibration, held-out test evaluation, optional SHAP summary.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import (
    RandomizedSearchCV,
    StratifiedKFold,
    cross_val_predict,
    train_test_split,
)
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler
from xgboost import XGBClassifier

RANDOM_STATE = 42
TEST_SIZE = 0.2

# Ordered domains (low -> high)
ORDINAL_WLB = ["Poor", "Average", "Good", "Excellent"]
ORDINAL_EDU = ["High School", "Bachelor's", "Master's", "PhD"]

ONE_HOT_FEATURES = [
    "Gender",
    "Marital Status",
    "Job Role",
    "Department",
    "Work Location",
]

NUMERIC_FEATURES = [
    "Age",
    "Tenure",
    "Salary",
    "Performance Rating",
    "Projects Completed",
    "Training Hours",
    "Promotions",
    "Overtime Hours",
    "Satisfaction Level",
    "Average Monthly Hours Worked",
    "Absenteeism",
    "Distance from Home",
    "Manager Feedback Score",
]


def _build_preprocessor() -> ColumnTransformer:
    """Preprocessor: ordinal (ordered categoricals), OHE (nominal), StandardScaler (numeric)."""
    ordinal_wlb = OrdinalEncoder(categories=[ORDINAL_WLB], handle_unknown="use_encoded_value", unknown_value=-1)
    ordinal_edu = OrdinalEncoder(categories=[ORDINAL_EDU], handle_unknown="use_encoded_value", unknown_value=-1)
    onehot = OneHotEncoder(handle_unknown="ignore", sparse_output=False)

    transformers = [
        ("wlb", ordinal_wlb, ["Work-Life Balance"]),
        ("edu", ordinal_edu, ["Education Level"]),
        ("cat", onehot, ONE_HOT_FEATURES),
        ("num", StandardScaler(), NUMERIC_FEATURES),
    ]
    return ColumnTransformer(transformers, remainder="drop", verbose_feature_names_out=False)


def make_pipeline(preprocessor: ColumnTransformer, *, clf_n_jobs: int = -1, **xgb_params) -> ImbPipeline:
    # SMOTE after encoding/scaling — all columns numeric
    # Use clf_n_jobs=1 inside RandomizedSearchCV to avoid oversubscription (CV × XGB threads).
    xgb = XGBClassifier(
        objective="binary:logistic",
        eval_metric="aucpr",
        random_state=RANDOM_STATE,
        n_jobs=clf_n_jobs,
        **xgb_params,
    )
    return ImbPipeline(
        [
            ("preprocess", preprocessor),
            ("smote", SMOTE(random_state=RANDOM_STATE)),
            ("clf", xgb),
        ]
    )


def _threshold_from_pr(y_true: np.ndarray, proba: np.ndarray, target_recall: float | None) -> float:
    """Pick probability threshold from PR curve. Prefer meeting target recall if possible, else F1-optimal."""
    precision, recall, thresholds = precision_recall_curve(y_true, proba)
    # thresholds align with precision[1:], recall[1:]
    if len(thresholds) == 0:
        return 0.5
    recall_tail = recall[1:]
    prec_tail = precision[1:]

    def _sanitize(t: float) -> float:
        """Avoid edge optima when scores are noisy (e.g. AUC ~ 0.5): extreme thresholds predict all one class."""
        rate = float(np.mean(proba >= t))
        if rate > 0.92 or rate < 0.08:
            return 0.5
        return float(t)

    if target_recall is not None:
        mask = recall_tail >= target_recall
        if mask.any():
            eligible = np.where(mask)[0]
            best_i = eligible[int(np.argmax(prec_tail[eligible]))]
            # Do not sanitize: high recall can legitimately flag a large share of rows; 0.92/0.08 would force 0.5.
            return float(thresholds[best_i])
    f1 = (2 * prec_tail * recall_tail) / (np.clip(prec_tail + recall_tail, 1e-12, None))
    thr = float(thresholds[int(np.nanargmax(f1))])
    return _sanitize(thr)


def train_and_evaluate(
    csv_path: Path,
    out_dir: Path,
    n_iter: int,
    cv_folds: int,
    target_recall: float | None,
    run_shap: bool,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(csv_path)

    if "Churn" not in df.columns:
        raise ValueError("Expected column 'Churn'")
    drop_cols = [c for c in ["Employee ID"] if c in df.columns]
    X = df.drop(columns=drop_cols + ["Churn"])
    y = df["Churn"].astype(int)

    X_train_p, X_test_p, y_train_p, y_test_p = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE
    )

    def _jsonable_params(d: dict) -> dict:
        out = {}
        for k, v in d.items():
            if isinstance(v, (np.floating, float)):
                out[k] = float(v)
            elif isinstance(v, (np.integer, np.int64, int)):
                out[k] = int(v)
            else:
                out[k] = v
        return out

    skf = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=RANDOM_STATE)
    sw_tr = float((y_train_p == 0).sum() / max((y_train_p == 1).sum(), 1))

    param_distributions = {
        "clf__n_estimators": np.arange(100, 601, 50),
        "clf__max_depth": np.arange(3, 12),
        "clf__learning_rate": np.linspace(0.01, 0.3, 20),
        "clf__subsample": np.linspace(0.6, 1.0, 9),
        "clf__colsample_bytree": np.linspace(0.6, 1.0, 9),
        "clf__min_child_weight": np.arange(1, 11),
        "clf__reg_alpha": np.logspace(-3, 1, 15),
        "clf__reg_lambda": np.logspace(-2, 2, 15),
        "clf__gamma": [0, 0.1, 0.5, 1.0],
    }

    preprocessor = _build_preprocessor()
    base_pipe = make_pipeline(preprocessor, clf_n_jobs=1, scale_pos_weight=sw_tr)

    search = RandomizedSearchCV(
        estimator=base_pipe,
        param_distributions=param_distributions,
        n_iter=n_iter,
        scoring="roc_auc",
        cv=skf,
        n_jobs=-1,
        random_state=RANDOM_STATE,
        verbose=1,
        refit=True,
    )
    search.fit(X_train_p, y_train_p)
    final_pipe: ImbPipeline = search.best_estimator_

    train_report = {
        "best_cv_roc_auc": float(search.best_score_),
        "best_params": _jsonable_params(search.best_params_),
        "n_samples_total": int(len(y)),
        "train_size": int(len(y_train_p)),
        "test_size": int(len(y_test_p)),
        "churn_rate_full": float(y.mean()),
        "churn_rate_train": float(y_train_p.mean()),
        "scale_pos_weight_train": sw_tr,
    }
    (out_dir / "training_report.json").write_text(json.dumps(train_report, indent=2))

    skf_tr = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=RANDOM_STATE)
    oof_proba = cross_val_predict(
        final_pipe,
        X_train_p,
        y_train_p,
        cv=skf_tr,
        method="predict_proba",
        n_jobs=-1,
    )[:, 1]
    thr = _threshold_from_pr(y_train_p.to_numpy(), oof_proba, target_recall=target_recall)

    # best_estimator_ is already refit on full train with refit=True; avoid a redundant third fit.
    test_proba = final_pipe.predict_proba(X_test_p)[:, 1]

    auc_test = roc_auc_score(y_test_p, test_proba)
    ap_test = average_precision_score(y_test_p, test_proba)

    y_pred_default = (test_proba >= 0.5).astype(int)
    y_pred_cal = (test_proba >= thr).astype(int)

    metrics = {
        "test_roc_auc": float(auc_test),
        "test_average_precision": float(ap_test),
        "optimal_threshold_oof": float(thr),
        "confusion_default_0.5": confusion_matrix(y_test_p, y_pred_default).tolist(),
        "confusion_calibrated": confusion_matrix(y_test_p, y_pred_cal).tolist(),
    }
    (out_dir / "test_metrics.json").write_text(json.dumps(metrics, indent=2))

    print("\n=== Churn model (XGBoost + SMOTE + tuned threshold) ===")
    print(f"CV ROC-AUC (train, {cv_folds}-fold): {search.best_score_:.4f}")
    print(f"Test ROC-AUC: {auc_test:.4f}")
    print(f"Test average precision: {ap_test:.4f}")
    print(f"OOF-tuned threshold: {thr:.4f}")
    print("\nClassification (test, threshold=0.5):")
    print(classification_report(y_test_p, y_pred_default, digits=3))
    print(f"Classification (test, threshold={thr:.3f}):")
    print(classification_report(y_test_p, y_pred_cal, digits=3))

    # Plots
    fpr, tpr, _ = roc_curve(y_test_p, test_proba)
    plt.figure(figsize=(6, 5))
    plt.plot(fpr, tpr, label=f"ROC (AUC={auc_test:.3f})")
    plt.plot([0, 1], [0, 1], "k--", label="chance")
    plt.xlabel("False positive rate")
    plt.ylabel("True positive rate")
    plt.title("Test ROC curve")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_dir / "roc_test.png", dpi=150)
    plt.close()

    prec_te, rec_te, _ = precision_recall_curve(y_test_p, test_proba)
    plt.figure(figsize=(6, 5))
    plt.plot(rec_te, prec_te, label=f"PR (AP={ap_test:.3f})")
    plt.xlabel("Recall")
    plt.ylabel("Precision")
    plt.title("Test precision–recall curve")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_dir / "pr_test.png", dpi=150)
    plt.close()

    # Persist
    fitted_pre = final_pipe.named_steps["preprocess"]
    joblib.dump(
        {
            "pipeline": final_pipe,
            "threshold": thr,
            "feature_names_after_preprocess": list(fitted_pre.get_feature_names_out()),
            "label": "Churn",
        },
        out_dir / "churn_model.joblib",
    )

    if run_shap:
        try:
            import shap
        except ImportError:
            print("SHAP not installed; skip explainability.")
            return

        # Transform test sample through preprocess + SMOTE complicates SHAP; explain raw margin on tree only
        pre_fitted = final_pipe.named_steps["preprocess"]
        clf = final_pipe.named_steps["clf"]
        X_sub = X_test_p.iloc[: min(2000, len(X_test_p))].copy()
        X_test_t = pre_fitted.transform(X_sub)
        explainer = shap.TreeExplainer(clf)
        shap_arr = np.asarray(explainer.shap_values(X_test_t))
        if shap_arr.ndim == 3:
            shap_values = shap_arr[:, :, 1] if shap_arr.shape[-1] == 2 else shap_arr[1]
        else:
            shap_values = shap_arr
        names = list(pre_fitted.get_feature_names_out())
        plt.figure(figsize=(10, 6))
        shap.summary_plot(shap_values, X_test_t, feature_names=names, show=False)
        plt.tight_layout()
        plt.savefig(out_dir / "shap_summary.png", dpi=120, bbox_inches="tight")
        plt.close()
        print(f"SHAP summary saved to {out_dir / 'shap_summary.png'}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train employee churn XGBoost pipeline.")
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parent / "employee_churn_dataset.csv",
        help="Path to CSV",
    )
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "artifacts", help="Output dir")
    parser.add_argument("--n-iter", type=int, default=60, help="RandomizedSearchCV iterations")
    parser.add_argument("--cv", type=int, default=5, help="Stratified K folds")
    parser.add_argument(
        "--target-recall",
        type=float,
        default=None,
        help="If set, pick smallest threshold with OOF recall >= this value (else F1-optimal on OOF)",
    )
    parser.add_argument("--shap", action="store_true", help="Save SHAP summary plot")
    args = parser.parse_args()
    train_and_evaluate(args.data, args.out, args.n_iter, args.cv, args.target_recall, args.shap)


if __name__ == "__main__":
    main()
