import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import data, forecast, finetune

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="Tabula Backend", version="1.0.0")

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
    return {"status": "healthy", "version": "1.0.0"}
