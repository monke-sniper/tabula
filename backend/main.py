import logging
import threading
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
_main_log = logging.getLogger("tabula.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the default chronos model so the first forecast is fast.
    try:
        thread = fc.warmup_default_models("amazon/chronos-t5-small")

        def _watch():
            thread.join(timeout=600)
            if thread.is_alive():
                _main_log.warning("chronos warmup did not complete within 600s")
            else:
                _loaded_models.add("amazon/chronos-t5-small")
                _main_log.info("chronos model ready: amazon/chronos-t5-small")

        threading.Thread(target=_watch, daemon=True, name="warmup-watcher").start()
    except Exception as e:  # pragma: no cover
        _main_log.warning("warmup spawn failed: %s", e)
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
