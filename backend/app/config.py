import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me-in-production")
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    DB_NAME = os.getenv("DB_NAME", "resume_ai")
    USE_FILE_DB = _bool("USE_FILE_DB", "true")
    DATA_DIR = Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data")))
    UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads")))
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
        ).split(",")
        if origin.strip()
    ]
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "3000"))


settings = Settings()
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
