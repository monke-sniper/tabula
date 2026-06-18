import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services import forecaster as fc
from routers import data, forecast, finetune

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

_loaded_models: set[str] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the default chronos model so the first forecast is fast.
    try:
        fc.warmup_default_models("amazon/chronos-t5-small")
    except Exception as e:  # pragma: no cover
        logging.getLogger("tabula.main").warning("warmup spawn failed: %s", e)
    yield


app = FastAPI(title="Tabula Backend", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(forecast.router)
app.include_router(finetune.router)


@app.get("/")
def root():
    return {"status": "ok", "app": "tabula"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "version": "1.1.0",
        "models_loaded": sorted(_loaded_models) or ["amazon/chronos-t5-small (warming)"],
    }
