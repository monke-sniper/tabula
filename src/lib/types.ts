export interface ColumnInfo {
  name: string;
  dtype: string;
  non_null: number;
  null_count: number;
  null_pct: number;
  unique?: number;
  mean?: number;
  std?: number;
  min?: number | string;
  max?: number | string;
  median?: number;
}

export interface EDAStats {
  rows: number;
  columns: number;
  column_info: ColumnInfo[];
  correlations: Record<string, Record<string, number>>;
  distributions: Record<string, { bins: number[]; counts: number[] }>;
  missing_values: { column: string; count: number; pct: number }[];
  outliers: { column: string; count: number; iqr: number }[];
}

export interface ForecastResult {
  timestamp: string;
  actual: number | null;
  is_forecast: boolean;
  iteration_values: number[];
  median: number;
  lower_10: number;
  upper_90: number;
  lower_25: number;
  upper_75: number;
}

export interface ForecastResponse {
  results: ForecastResult[];
  metrics: {
    mae: number;
    rmse: number;
    mape: number;
  };
  iterations: number;
  prediction_length: number;
}

export interface ModelInfo {
  name: string;
  base_model: string;
  path: string;
  created_at: string;
  metrics?: {
    loss?: number;
    eval_loss?: number;
  };
}

export interface FineTuneConfig {
  model_name: string;
  custom_name: string;
  learning_rate: number;
  num_epochs: number;
  batch_size: number;
  warmup_steps: number;
  weight_decay: number;
  train_split: number;
  val_split: number;
}

export interface FineTuneStatus {
  status: 'idle' | 'training' | 'completed' | 'error';
  progress: number;
  current_epoch: number;
  total_epochs: number;
  train_loss: number;
  eval_loss: number;
  message: string;
}

export interface UploadResponse {
  session_id: string;
  filename: string;
  rows: number;
  columns: number;
  column_names: string[];
  preview: Record<string, unknown>[];
  has_timestamp: boolean;
  timestamp_column: string | null;
  numeric_columns: string[];
}
