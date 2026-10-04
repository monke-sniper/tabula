import math
import os
import time
import uuid
from typing import Optional

import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

router = APIRouter()

SESSION_DIR = os.path.join(os.path.dirname(__file__), '..', 'sessions')
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SUPPORTED_EXTS = ('.csv', '.json', '.xlsx', '.xls', '.parquet')
PREVIEW_ROWS = 50
os.makedirs(SESSION_DIR, exist_ok=True)

sessions: dict[str, pd.DataFrame] = {}
session_meta: dict[str, dict] = {}


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


def _num(x) -> Optional[float]:
    """Round to 6dp, mapping NaN/inf to None so the response stays valid JSON."""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return round(f, 6) if math.isfinite(f) else None


def _preview(df: pd.DataFrame) -> list[dict]:
    head = df.head(PREVIEW_ROWS)
    return head.astype(object).where(head.notna(), None).to_dict(orient='records')


def detect_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return col
        # In modern pandas the dtype may be `string`, not `object`
        if df[col].dtype == object or pd.api.types.is_string_dtype(df[col]):
            sample = df[col].dropna().head(10)
            if sample.empty:
                continue
            try:
                pd.to_datetime(sample)
                return col
            except (ValueError, TypeError):
                continue
    return None


def parse_file(file_path: str) -> pd.DataFrame:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(file_path)
    if ext == '.json':
        return pd.read_json(file_path)
    if ext in ('.xlsx', '.xls'):
        return pd.read_excel(file_path)
    if ext == '.parquet':
        return pd.read_parquet(file_path)
    raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


def _check_ext(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    if ext not in SUPPORTED_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    return ext


def _register(df: pd.DataFrame, filename: str, session_id: Optional[str] = None) -> UploadResponse:
    session_id = session_id or str(uuid.uuid4())
    ts_col = detect_timestamp_column(df)
    if ts_col and not pd.api.types.is_datetime64_any_dtype(df[ts_col]):
        try:
            df[ts_col] = pd.to_datetime(df[ts_col])
        except (ValueError, TypeError):
            ts_col = None

    sessions[session_id] = df
    session_meta[session_id] = {"filename": filename, "created_at": time.time()}

    return UploadResponse(
        session_id=session_id,
        filename=filename,
        rows=len(df),
        columns=len(df.columns),
        column_names=[str(c) for c in df.columns],
        preview=_preview(df),
        has_timestamp=ts_col is not None,
        timestamp_column=ts_col,
        numeric_columns=df.select_dtypes(include=['number']).columns.tolist(),
    )


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = _check_ext(file.filename)

    session_id = str(uuid.uuid4())
    file_path = os.path.join(SESSION_DIR, f"{session_id}{ext}")
    with open(file_path, 'wb') as f:
        f.write(await file.read())

    try:
        df = parse_file(file_path)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    return _register(df, file.filename, session_id)


@router.post("/upload-path", response_model=UploadResponse)
async def upload_by_path(req: UploadPathRequest):
    path = req.path
    # Relative paths resolve against the repo root, so the bundled sample
    # loads no matter which directory the backend was started from.
    if not os.path.isabs(path) and not os.path.exists(path):
        path = os.path.join(REPO_ROOT, path)
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.path}")
    _check_ext(path)

    try:
        df = parse_file(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    return _register(df, os.path.basename(path))


def get_session(session_id: str) -> pd.DataFrame:
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Upload data first.")
    return sessions[session_id]


def is_id_like(name: str) -> bool:
    n = name.lower()
    return n in {"id", "idx", "index"} or n.endswith("_id") or n.startswith("id_")


def pick_target(df: pd.DataFrame, requested: Optional[str]) -> str:
    """Validate a requested numeric column, or default to the first non-id one."""
    numeric = df.select_dtypes(include=['number']).columns.tolist()
    if requested:
        if requested not in df.columns:
            raise HTTPException(status_code=400, detail=f"column '{requested}' not found")
        if requested not in numeric:
            raise HTTPException(status_code=400, detail=f"column '{requested}' is not numeric")
        return requested
    candidates = [c for c in numeric if not is_id_like(str(c))] or numeric
    if not candidates:
        raise HTTPException(status_code=400, detail="No numeric columns found")
    return candidates[0]


@router.get("/eda/{session_id}")
def get_eda(session_id: str):
    df = get_session(session_id)

    column_info = []
    for col in df.columns:
        s = df[col]
        info = {
            'name': str(col),
            'dtype': str(s.dtype),
            'non_null': int(s.notna().sum()),
            'null_count': int(s.isna().sum()),
            'null_pct': round(float(s.isna().mean()) * 100, 2) if len(s) else 0.0,
            'unique': int(s.nunique()),
        }
        if pd.api.types.is_numeric_dtype(s):
            info.update(
                mean=_num(s.mean()), std=_num(s.std()),
                min=_num(s.min()), max=_num(s.max()), median=_num(s.median()),
            )
        else:
            has_values = s.notna().any()
            info['min'] = str(s.min()) if has_values else None
            info['max'] = str(s.max()) if has_values else None
        column_info.append(info)

    numeric_df = df.select_dtypes(include=['number'])
    correlations = {}
    if len(numeric_df.columns) >= 2:
        corr = numeric_df.corr()
        correlations = {
            str(c1): {str(c2): _num(corr.loc[c1, c2]) for c2 in corr.columns}
            for c1 in corr.columns
        }

    distributions = {}
    outliers = []
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if series.empty:
            continue
        cats, bin_edges = pd.cut(series, bins=20, retbins=True)
        distributions[str(col)] = {
            'bins': [round(float(x), 4) for x in bin_edges],
            'counts': [int(x) for x in cats.value_counts(sort=False).sort_index().values],
        }
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        count = int(((series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)).sum())
        if count:
            outliers.append({'column': str(col), 'count': count, 'iqr': round(float(iqr), 4)})

    missing_values = [
        {'column': str(col), 'count': int(n), 'pct': round(float(n / len(df)) * 100, 2)}
        for col, n in df.isna().sum().items() if n > 0
    ]

    return {
        'rows': len(df),
        'columns': len(df.columns),
        'column_info': column_info,
        'correlations': correlations,
        'distributions': distributions,
        'missing_values': missing_values,
        'outliers': outliers,
    }


@router.get("/sessions")
def list_sessions():
    now = time.time()
    return {"sessions": [
        {
            "session_id": sid,
            "filename": session_meta.get(sid, {}).get("filename", ""),
            "rows": int(df.shape[0]),
            "columns": int(df.shape[1]),
            "age_seconds": round(now - session_meta.get(sid, {}).get("created_at", now), 1),
        }
        for sid, df in sessions.items()
    ]}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    get_session(session_id)
    del sessions[session_id]
    session_meta.pop(session_id, None)
    for ext in SUPPORTED_EXTS:
        path = os.path.join(SESSION_DIR, f"{session_id}{ext}")
        if os.path.exists(path):
            os.remove(path)
            break
    return {"status": "deleted", "session_id": session_id}


CLEAN_STRATEGIES = {"drop", "mean", "zero", "ffill", "clip"}


class CleanRequest(BaseModel):
    strategy: str  # 'drop' | 'mean' | 'zero' | 'ffill' | 'clip'
    columns: list[str] = []


@router.post("/sessions/{session_id}/clean")
def clean_session(session_id: str, req: CleanRequest):
    df = get_session(session_id).copy()
    if req.strategy not in CLEAN_STRATEGIES:
        raise HTTPException(status_code=400, detail=f"strategy must be one of {'|'.join(sorted(CLEAN_STRATEGIES))}")

    rows_before = int(df.shape[0])
    cols = [c for c in req.columns if c in df.columns]
    if not cols and req.strategy != "drop":
        raise HTTPException(status_code=400, detail="no columns specified to clean")

    if req.strategy == "drop":
        df = df.dropna(subset=cols or None)
    else:
        for c in cols:
            s = df[c]
            if req.strategy == "zero":
                df[c] = s.fillna(0)
            elif req.strategy == "ffill":
                df[c] = s.ffill().bfill()
            elif not pd.api.types.is_numeric_dtype(s):
                continue
            elif req.strategy == "mean":
                df[c] = s.fillna(s.mean())
            elif req.strategy == "clip":
                # cap values to the Tukey fences used by the EDA outlier count
                q1, q3 = s.quantile(0.25), s.quantile(0.75)
                iqr = q3 - q1
                df[c] = s.clip(q1 - 1.5 * iqr, q3 + 1.5 * iqr)

    sessions[session_id] = df
    return {
        "session_id": session_id,
        "rows_before": rows_before,
        "rows_after": int(df.shape[0]),
        "columns_modified": cols or [str(c) for c in df.columns],
        "preview": _preview(df),
    }
