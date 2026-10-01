from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import create_indexes, ping_database, ENGINE
from .config import settings
from .models_manager import model_manager
import logging

logger = logging.getLogger(__name__)

app = FastAPI(
    title="ResumeAI",
    description="AI-powered resume screening, job matching, and sentiment analysis",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    try:
        await create_indexes()
    except Exception as e:
        logger.warning("Could not create database indexes: %s", e)


@app.get("/")
async def root():
    return {
        "name": "ResumeAI",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    db_status = await ping_database()
    models = model_manager.get_model_status()
    return {
        "status": "ok",
        "database": db_status,
        "models": models,
        "engine": ENGINE,
    }


from . import auth
app.include_router(auth.router, prefix="/auth", tags=["Auth"])

from . import candidate
app.include_router(candidate.router, prefix="/candidate", tags=["Candidate"])

from . import recruiter
app.include_router(recruiter.router, prefix="/recruiter", tags=["Recruiter"])
logger.info("All API routers registered")
