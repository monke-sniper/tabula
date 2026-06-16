import os
import json
import uuid
import threading
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

training_status = {
    'status': 'idle',
    'progress': 0.0,
    'current_epoch': 0,
    'total_epochs': 0,
    'train_loss': 0.0,
    'eval_loss': 0.0,
    'message': '',
}

training_thread: Optional[threading.Thread] = None


class FineTuneRequest(BaseModel):
    session_id: str
    model_name: str
    custom_name: str
    learning_rate: float = 1e-4
    num_epochs: int = 3
    batch_size: int = 8
    warmup_steps: int = 100
    weight_decay: float = 0.01
    train_split: float = 0.8
    val_split: float = 0.1


class ModelListResponse(BaseModel):
    models: list[dict]
    active: str


class SetActiveRequest(BaseModel):
    model: str


def _get_df(session_id: str) -> pd.DataFrame:
    from routers.data import sessions
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Upload data first.")
    return sessions[session_id]


def _load_model_registry() -> dict:
    registry_path = os.path.join(MODELS_DIR, 'registry.json')
    if os.path.exists(registry_path):
        with open(registry_path, 'r') as f:
            return json.load(f)
    return {'models': [], 'active': 'amazon/chronos-t5-small'}


def _save_model_registry(registry: dict):
    registry_path = os.path.join(MODELS_DIR, 'registry.json')
    with open(registry_path, 'w') as f:
        json.dump(registry, f, indent=2)


def _train_worker(config: dict, df: pd.DataFrame):
    global training_status
    try:
        training_status['status'] = 'training'
        training_status['message'] = 'Preparing data...'

        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        if not numeric_cols:
            training_status['status'] = 'error'
            training_status['message'] = 'No numeric columns found'
            return

        target_col = numeric_cols[0]
        values = df[target_col].dropna().values.astype(np.float32)

        if len(values) < 50:
            training_status['status'] = 'error'
            training_status['message'] = f'Not enough data ({len(values)} points). Need at least 50.'
            return

        # Normalize
        mean_val = np.mean(values)
        std_val = np.std(values) if np.std(values) > 0 else 1.0
        normalized = (values - mean_val) / std_val

        seq_len = min(64, len(normalized) // 4)
        if seq_len < 8:
            training_status['status'] = 'error'
            training_status['message'] = 'Data too short for training'
            return

        # Create sequences
        X, y = [], []
        for i in range(len(normalized) - seq_len):
            X.append(normalized[i:i + seq_len])
            y.append(normalized[i + seq_len])

        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.float32)

        split_idx = int(len(X) * config['train_split'])
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]

        try:
            import torch
            import torch.nn as nn
            from torch.utils.data import DataLoader, TensorDataset

            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

            class TimeSeriesModel(nn.Module):
                def __init__(self, input_size):
                    super().__init__()
                    self.lstm = nn.LSTM(input_size, 64, num_layers=2, batch_first=True, dropout=0.1)
                    self.fc = nn.Sequential(
                        nn.Linear(64, 32),
                        nn.ReLU(),
                        nn.Dropout(0.1),
                        nn.Linear(32, 1),
                    )

                def forward(self, x):
                    out, _ = self.lstm(x)
                    return self.fc(out[:, -1, :]).squeeze(-1)

            model = TimeSeriesModel(1).to(device)
            optimizer = torch.optim.AdamW(
                model.parameters(),
                lr=config['learning_rate'],
                weight_decay=config['weight_decay'],
            )
            total_steps = config['num_epochs'] * (len(X_train) // config['batch_size'] + 1)
            warmup = min(config['warmup_steps'], total_steps // 4)

            def lr_lambda(step):
                if step < warmup:
                    return step / max(warmup, 1)
                return max(0.0, 1.0 - (step - warmup) / max(total_steps - warmup, 1))

            scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

            X_train_t = torch.tensor(X_train, dtype=torch.float32).unsqueeze(-1).to(device)
            y_train_t = torch.tensor(y_train, dtype=torch.float32).to(device)
            X_val_t = torch.tensor(X_val, dtype=torch.float32).unsqueeze(-1).to(device)
            y_val_t = torch.tensor(y_val, dtype=torch.float32).to(device)

            train_dataset = TensorDataset(X_train_t, y_train_t)
            train_loader = DataLoader(train_dataset, batch_size=config['batch_size'], shuffle=True)

            training_status['total_epochs'] = config['num_epochs']
            training_status['message'] = f'Training on device: {device}'

            for epoch in range(config['num_epochs']):
                model.train()
                epoch_loss = 0.0
                n_batches = 0

                for batch_X, batch_y in train_loader:
                    optimizer.zero_grad()
                    pred = model(batch_X)
                    loss = nn.MSELoss()(pred, batch_y)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    scheduler.step()
                    epoch_loss += loss.item()
                    n_batches += 1

                avg_train_loss = epoch_loss / max(n_batches, 1)

                model.eval()
                with torch.no_grad():
                    val_pred = model(X_val_t)
                    val_loss = nn.MSELoss()(val_pred, y_val_t).item()

                training_status['current_epoch'] = epoch + 1
                training_status['train_loss'] = round(avg_train_loss, 6)
                training_status['eval_loss'] = round(val_loss, 6)
                training_status['progress'] = round((epoch + 1) / config['num_epochs'] * 100, 1)
                training_status['message'] = f'Epoch {epoch + 1}/{config["num_epochs"]} - loss: {avg_train_loss:.4f}'

            # Save model
            model_path = os.path.join(MODELS_DIR, config['custom_name'])
            os.makedirs(model_path, exist_ok=True)
            torch.save({
                'model_state_dict': model.state_dict(),
                'config': {
                    'input_size': 1,
                    'hidden_size': 64,
                    'num_layers': 2,
                },
                'training_config': config,
                'norm_stats': {'mean': float(mean_val), 'std': float(std_val)},
            }, os.path.join(model_path, 'model.pt'))

            # Register model
            registry = _load_model_registry()
            registry['models'] = [
                m for m in registry['models'] if m['name'] != config['custom_name']
            ]
            registry['models'].append({
                'name': config['custom_name'],
                'base_model': config['model_name'],
                'path': model_path,
                'created_at': pd.Timestamp.now().isoformat(),
                'metrics': {
                    'loss': training_status['train_loss'],
                    'eval_loss': training_status['eval_loss'],
                },
            })
            _save_model_registry(registry)

            training_status['status'] = 'completed'
            training_status['message'] = f'Model saved to {model_path}'

        except ImportError as e:
            training_status['status'] = 'error'
            training_status['message'] = f'Missing dependency: {e}'

    except Exception as e:
        training_status['status'] = 'error'
        training_status['message'] = f'Training failed: {str(e)}'


@router.post("/finetune/start")
def start_finetune(req: FineTuneRequest):
    global training_thread

    if training_status['status'] == 'training':
        raise HTTPException(status_code=400, detail="Training already in progress")

    df = _get_df(req.session_id)

    if not req.custom_name.strip():
        raise HTTPException(status_code=400, detail="Custom model name is required")

    config = req.model_dump()

    training_status.update({
        'status': 'starting',
        'progress': 0,
        'current_epoch': 0,
        'total_epochs': req.num_epochs,
        'train_loss': 0,
        'eval_loss': 0,
        'message': 'Initializing...',
    })

    training_thread = threading.Thread(target=_train_worker, args=(config, df), daemon=True)
    training_thread.start()

    return {"status": "started", "message": "Fine-tuning started"}


@router.get("/finetune/status")
def get_status():
    return training_status


@router.get("/models")
def list_models():
    registry = _load_model_registry()
    return {
        'models': registry['models'],
        'active': registry['active'],
    }


@router.put("/models/active")
def set_active_model(req: SetActiveRequest):
    registry = _load_model_registry()
    registry['active'] = req.model
    _save_model_registry(registry)
    return {"status": "ok", "active": req.model}
