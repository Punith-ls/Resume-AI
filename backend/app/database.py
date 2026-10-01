from pathlib import Path
import logging

from .config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ENGINE = "file"
client = None

if settings.USE_FILE_DB:
    from .file_db import FileDatabase

    db = FileDatabase(settings.DATA_DIR)
    ENGINE = "file"
    logger.info("Using local JSON database at %s", settings.DATA_DIR)
else:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(settings.MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[settings.DB_NAME]
    ENGINE = "mongo"
    logger.info("Using MongoDB at %s / %s", settings.MONGO_URL.split("@")[-1], settings.DB_NAME)

candidates_collection = db.candidates
recruiters_collection = db.recruiters
jobs_collection = db.jobs
shortlisted_candidates_collection = db.shortlisted_candidates


async def ping_database() -> dict:
    if ENGINE == "file":
        return {"ok": True, "engine": "file", "path": str(settings.DATA_DIR)}
    await client.admin.command("ping")
    return {"ok": True, "engine": "mongo"}


async def create_indexes():
    try:
        await candidates_collection.create_index("email", unique=True)
        await candidates_collection.create_index("resume.uploaded_at")
        await candidates_collection.create_index("resume.analysis_status")
        await recruiters_collection.create_index("email", unique=True)
        await recruiters_collection.create_index("company_id")
        await recruiters_collection.create_index("loaded_resumes.candidate_id")
        await jobs_collection.create_index("recruiter_id")
        await jobs_collection.create_index("posted_at")
        await jobs_collection.create_index("title")
        await shortlisted_candidates_collection.create_index("recruiter_id")
        await shortlisted_candidates_collection.create_index("analysis_method")
        await shortlisted_candidates_collection.create_index("created_at")
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error("Error creating database indexes: %s", e)
