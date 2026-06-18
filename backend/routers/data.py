import os
import uuid
import json
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

SESSION_DIR = os.path.join(os.path.dirname(__file__), '..', 'sessions')
os.makedirs(SESSION_DIR, exist_ok=True)

sessions: dict[str, pd.DataFrame] = {}


class UploadResponse(BaseModel):
    session_id: str
    filename: str
    rows: int
    columns: int
    column_names: list[str]
    preview: list[dict]
    has_timestamp: bool
    timestamp_column: Optional[str]
    numeric_columns: list[str]


class UploadPathRequest(BaseModel):
    path: str


def detect_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col
        # In modern pandas the dtype may be `string`, not `object`
        if df[col].dtype == object or pd.api.types.is_string_dtype(df[col]):
            try:
                pd.to_datetime(df[col].head(10))
                return col
            except (ValueError, TypeError):
                continue
    return None


def parse_file(file_path: str) -> pd.DataFrame:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(file_path)
    elif ext in ('.json',):
        return pd.read_json(file_path)
    elif ext in ('.xlsx', '.xls'):
        return pd.read_excel(file_path)
    elif ext == '.parquet':
        return pd.read_parquet(file_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.csv', '.json', '.xlsx', '.xls', '.parquet'):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    session_id = str(uuid.uuid4())
    file_path = os.path.join(SESSION_DIR, f"{session_id}{ext}")

    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)

    try:
        df = parse_file(file_path)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    sessions[session_id] = df
    session_meta[session_id] = {"filename": file.filename}

    ts_col = detect_timestamp_column(df)
    if ts_col and not pd.api.types.is_datetime64_any_dtype(df[ts_col]):
        try:
            df[ts_col] = pd.to_datetime(df[ts_col])
            sessions[session_id] = df
        except Exception:
            pass

    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
    preview = df.head(50).where(df.notna(), None).to_dict(orient='records')

    return UploadResponse(
        session_id=session_id,
        filename=file.filename,
        rows=len(df),
        columns=len(df.columns),
        column_names=df.columns.tolist(),
        preview=preview,
        has_timestamp=ts_col is not None,
        timestamp_column=ts_col,
        numeric_columns=numeric_cols,
    )


@router.post("/upload-path", response_model=UploadResponse)
async def upload_by_path(req: UploadPathRequest):
    if not os.path.exists(req.path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.path}")

    ext = os.path.splitext(req.path)[1].lower()
    if ext not in ('.csv', '.json', '.xlsx', '.xls', '.parquet'):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    session_id = str(uuid.uuid4())

    try:
        df = parse_file(req.path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    sessions[session_id] = df
    session_meta[session_id] = {"filename": os.path.basename(req.path)}

    ts_col = detect_timestamp_column(df)
    if ts_col and not pd.api.types.is_datetime64_any_dtype(df[ts_col]):
        try:
            df[ts_col] = pd.to_datetime(df[ts_col])
            sessions[session_id] = df
        except Exception:
            pass

    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
    preview = df.head(50).where(df.notna(), None).to_dict(orient='records')

    return UploadResponse(
        session_id=session_id,
        filename=os.path.basename(req.path),
        rows=len(df),
        columns=len(df.columns),
        column_names=df.columns.tolist(),
        preview=preview,
        has_timestamp=ts_col is not None,
        timestamp_column=ts_col,
        numeric_columns=numeric_cols,
    )


@router.get("/eda/{session_id}")
def get_eda(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    df = sessions[session_id]

    column_info = []
    for col in df.columns:
        info = {
            'name': col,
            'dtype': str(df[col].dtype),
            'non_null': int(df[col].notna().sum()),
            'null_count': int(df[col].isna().sum()),
            'null_pct': round(float(df[col].isna().mean()) * 100, 2),
            'unique': int(df[col].nunique()),
        }
        if pd.api.types.is_numeric_dtype(df[col]):
            desc = df[col].describe()
            info['mean'] = round(float(desc.get('mean', 0)), 6)
            info['std'] = round(float(desc.get('std', 0)), 6)
            info['min'] = round(float(desc.get('min', 0)), 6)
            info['max'] = round(float(desc.get('max', 0)), 6)
            info['median'] = round(float(df[col].median()), 6)
        else:
            info['min'] = str(df[col].min()) if df[col].notna().any() else None
            info['max'] = str(df[col].max()) if df[col].notna().any() else None
        column_info.append(info)

    numeric_df = df.select_dtypes(include=['number'])
    correlations = {}
    if len(numeric_df.columns) >= 2:
        corr = numeric_df.corr()
        for col1 in corr.columns:
            correlations[col1] = {}
            for col2 in corr.columns:
                correlations[col1][col2] = round(float(corr.loc[col1, col2]), 4)

    distributions = {}
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) > 0:
            counts, bin_edges = pd.cut(series, bins=20, retbins=True)
            distributions[col] = {
                'bins': [round(float(x), 4) for x in bin_edges],
                'counts': [int(x) for x in counts.value_counts().sort_index().values],
            }

    missing_values = []
    for col in df.columns:
        count = int(df[col].isna().sum())
        if count > 0:
            missing_values.append({
                'column': col,
                'count': count,
                'pct': round(float(count / len(df)) * 100, 2),
            })

    outliers = []
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) > 0:
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            outlier_count = int(((series < lower) | (series > upper)).sum())
            if outlier_count > 0:
                outliers.append({
                    'column': col,
                    'count': outlier_count,
                    'iqr': round(float(iqr), 4),
                })

    return {
        'rows': len(df),
        'columns': len(df.columns),
        'column_info': column_info,
        'correlations': correlations,
        'distributions': distributions,
        'missing_values': missing_values,
        'outliers': outliers,
    }


def get_session(session_id: str) -> pd.DataFrame:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]


@router.get("/sessions")
def list_sessions():
    import time
    out = []
    now = time.time()
    for sid, df in sessions.items():
        path = os.path.join(SESSION_DIR, f"{sid}.csv")
        age = 0.0
        if os.path.exists(path):
            age = now - os.path.getmtime(path)
        out.append({
            "session_id": sid,
            "filename": session_meta.get(sid, {}).get("filename", ""),
            "rows": int(df.shape[0]),
            "columns": int(df.shape[1]),
            "age_seconds": round(age, 1),
        })
    return {"sessions": out}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    del sessions[session_id]
    session_meta.pop(session_id, None)
    for ext in (".csv", ".json", ".xlsx", ".xls", ".parquet"):
        path = os.path.join(SESSION_DIR, f"{session_id}{ext}")
        if os.path.exists(path):
            os.remove(path)
            break
    return {"status": "deleted", "session_id": session_id}


class CleanRequest(BaseModel):
    strategy: str  # 'drop' | 'mean' | 'zero' | 'ffill'
    columns: list[str] = []


@router.post("/sessions/{session_id}/clean")
def clean_session(session_id: str, req: CleanRequest):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    if req.strategy not in {"drop", "mean", "zero", "ffill"}:
        raise HTTPException(status_code=400, detail="strategy must be drop|mean|zero|ffill")

    df = sessions[session_id].copy()
    rows_before = int(df.shape[0])
    cols_to_touch = [c for c in req.columns if c in df.columns]
    if not cols_to_touch and req.strategy != "drop":
        raise HTTPException(status_code=400, detail="no columns specified to clean")

    if req.strategy == "drop":
        if cols_to_touch:
            df = df.dropna(subset=cols_to_touch)
        else:
            df = df.dropna()
    elif req.strategy == "mean":
        for c in cols_to_touch:
            if pd.api.types.is_numeric_dtype(df[c]):
                mean = df[c].mean()
                df[c] = df[c].fillna(mean)
    elif req.strategy == "zero":
        for c in cols_to_touch:
            df[c] = df[c].fillna(0)
    elif req.strategy == "ffill":
        for c in cols_to_touch:
            df[c] = df[c].ffill().bfill()

    sessions[session_id] = df
    return {
        "session_id": session_id,
        "rows_before": rows_before,
        "rows_after": int(df.shape[0]),
        "columns_modified": cols_to_touch if cols_to_touch else list(df.columns),
    }


session_meta: dict[str, dict] = {}
