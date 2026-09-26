from __future__ import annotations

import pandas as pd
import streamlit as st

st.set_page_config(page_title="VAYU Analytics Lab", page_icon="Y", layout="wide")

st.title("VAYU | Weather Intelligence & Analytics Lab")
st.caption("Engineering observability dashboard · synthetic/demo metrics · not an official IMD warning system")

st.sidebar.header("Analytics controls")
window = st.sidebar.selectbox("Time window", ["Last 24 hours", "Last 7 days", "Historical sample"])
st.sidebar.info("Severity is VAANKAN internal decision support, not an official IMD classification.")

col1, col2, col3, col4 = st.columns(4)
col1.metric("Dataset", "100,000", "synthetic target")
col2.metric("Stations", "742", "demo coverage")
col3.metric("Weather events", "7", "supported categories")
col4.metric("Status", "DEMO", "metrics are placeholders")

st.warning("These are deterministic demonstration values. Real anomaly, clustering, and severity metrics require the generated VAYU dataset and trained evaluation runs.")

model_metrics = pd.DataFrame(
    [
        ["Isolation Forest", "Point anomaly detection", 0.84, 0.79, 0.81, 0.88],
        ["LSTM Autoencoder", "Temporal anomaly detection", 0.81, 0.76, 0.78, 0.85],
        ["DBSCAN", "Spatial hotspot clustering", 0.73, 0.68, 0.70, 0.77],
        ["WESI-style severity", "Transparent severity scoring", 0.86, 0.82, 0.84, 0.90],
    ],
    columns=["Model", "Task", "Precision", "Recall", "F1", "ROC-AUC"],
)

st.subheader("Model performance")
st.dataframe(model_metrics.style.format({"Precision": "{:.0%}", "Recall": "{:.0%}", "F1": "{:.0%}", "ROC-AUC": "{:.0%}"}), use_container_width=True, hide_index=True)
st.bar_chart(model_metrics.set_index("Model")[["Precision", "Recall", "F1", "ROC-AUC"]])

left, right = st.columns(2)
with left:
    st.subheader("Weather trends")
    trend = pd.DataFrame(
        {"Rainfall (mm)": [12, 18, 24, 41, 38, 56, 63, 49], "Temperature (C)": [31, 31, 30, 29, 28, 27, 27, 28]},
        index=["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
    )
    st.line_chart(trend)
    st.caption(f"Synthetic trend window: {window}")
with right:
    st.subheader("Event categories")
    categories = pd.DataFrame({"Reports": [420, 310, 180, 95, 70, 55, 44], "Category": ["Rainfall", "Flooding", "Thunderstorms", "Heatwaves", "Fog", "Dust storms", "Strong winds"]}).set_index("Category")
    st.bar_chart(categories)

st.subheader("Anomaly and hotspot summary")
summary = pd.DataFrame(
    [
        ["Tamil Nadu coast", "Rainfall", "High", 0.91, 48, 18.4],
        ["Kerala coast", "Flooding", "Medium", 0.78, 31, 10.2],
        ["Rajasthan west", "Dust storms", "Medium", 0.74, 19, 22.8],
        ["Punjab north", "Fog", "Low", 0.62, 12, 8.7],
    ],
    columns=["Hotspot", "Event", "Severity", "Anomaly score", "Verified reports", "Affected radius (km)"],
)
st.dataframe(summary.style.format({"Anomaly score": "{:.0%}", "Affected radius (km)": "{:.1f}"}), use_container_width=True, hide_index=True)

st.subheader("Pipeline readiness")
st.markdown("""
- Weather observations: provider adapters planned for Open-Meteo, IMD, and mock feeds
- Anomaly detection: Isolation Forest and LSTM Autoencoder planned
- Hotspots: DBSCAN and PostGIS spatial queries planned
- Severity: transparent internal decision-support score
- Current state: dashboard contract and synthetic preview only
""")
