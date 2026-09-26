from __future__ import annotations

import pandas as pd
import streamlit as st

st.set_page_config(page_title="VISTA Model Lab", page_icon="V", layout="wide")

st.title("VISTA | Verification Intelligence Model Lab")
st.caption("Engineering observability dashboard · synthetic/demo metrics · not a production model")

st.sidebar.header("Dataset controls")
dataset_rows = st.sidebar.selectbox("Dataset view", ["20,000 planned rows", "Sample preview (12 rows)"])
st.sidebar.info("VISTA must not claim absolute truth. Scores represent evidence support and model confidence.")

metrics = pd.DataFrame(
    [
        ["XLM-R / IndicBERT", "Text classification", 0.89, 0.86, 0.87, 0.91],
        ["CLIP / ViT", "Image-event consistency", 0.84, 0.81, 0.82, 0.88],
        ["Sentence-BERT + FAISS", "Duplicate similarity", 0.92, 0.90, 0.91, 0.94],
        ["DBSCAN + PostGIS", "Spatial corroboration", 0.86, 0.83, 0.84, 0.89],
        ["XGBoost evidence fusion", "Final verification", 0.91, 0.89, 0.90, 0.95],
    ],
    columns=["Model", "Task", "Accuracy", "Precision", "F1", "ROC-AUC"],
)

col1, col2, col3, col4 = st.columns(4)
col1.metric("Dataset", "20,000", "synthetic target")
col2.metric("Models", "5", "pipeline components")
col3.metric("Macro F1", "0.87", "demo evaluation")
col4.metric("Status", "DEMO", "metrics are placeholders")

st.warning("These metrics are deterministic demonstration values. They must be replaced with metrics generated from a real train/validation/test run before use in decisions.")

st.subheader("Model performance")
st.dataframe(metrics.style.format({"Accuracy": "{:.0%}", "Precision": "{:.0%}", "F1": "{:.0%}", "ROC-AUC": "{:.0%}"}), use_container_width=True, hide_index=True)
st.bar_chart(metrics.set_index("Model")[["Precision", "F1", "ROC-AUC"]])

left, right = st.columns(2)
with left:
    st.subheader("Verification classes")
    class_counts = pd.DataFrame({"Reports": [11200, 5200, 3600], "Class": ["Verified", "Suspicious", "Unsupported"]}).set_index("Class")
    st.bar_chart(class_counts)
    st.caption("Synthetic class distribution target")
with right:
    st.subheader("Evidence fusion")
    evidence = pd.DataFrame({"Feature": ["Text", "Image", "Video", "Weather", "Location", "Time", "Source", "Spatial", "Media reuse"], "Contribution": [0.76, 0.64, 0.42, 0.88, 0.91, 0.79, 0.68, 0.83, 0.19]}).set_index("Feature")
    st.bar_chart(evidence)
    st.caption("Demo evidence contribution; SHAP is not connected yet")

st.subheader("Dataset preview")
preview = pd.DataFrame(
    {
        "report_id": [f"R{10234 + i}" for i in range(12)],
        "source_type": ["citizen", "weather_api", "social", "website"] * 3,
        "event_type": ["flooding", "rainfall", "thunderstorm", "fog"] * 3,
        "verification_status": ["VERIFIED", "PENDING", "SUSPICIOUS", "UNSUPPORTED"] * 3,
        "final_verification_score": [0.93, 0.71, 0.22, 0.41] * 3,
    }
)
st.dataframe(preview if dataset_rows.startswith("Sample") else preview.head(5), use_container_width=True, hide_index=True)

st.subheader("Pipeline readiness")
st.markdown("""
- Text: XLM-R / IndicBERT adapter planned
- Image and video: CLIP/ViT adapter planned
- Similarity: Sentence-BERT and FAISS adapter planned
- Spatial corroboration: DBSCAN/PostGIS adapter planned
- Evidence fusion: XGBoost and SHAP adapter planned
- Current state: dashboard contract and synthetic preview only
""")
