from dotenv import load_dotenv
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
dotenv_path = os.path.join(PROJECT_ROOT, ".env")
load_dotenv(dotenv_path)

ENVIRONMENT = os.getenv("ENVIRONMENT", "DEV")

if ENVIRONMENT == "PROD":
    _db_url = os.getenv("DATABASE_URL")
    if not _db_url:
        raise RuntimeError("DATABASE_URL is required when ENVIRONMENT=PROD")
    # Convert standard postgresql:// to async driver
    DATABASE_URL = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = os.getenv(
        "DATABASE_URL", "sqlite+aiosqlite:///./data/fingdb.db"
    )

ADMIN_USER = os.getenv("ADMIN_USER")
ADMIN_PSWD = os.getenv("ADMIN_PSWD")
SECRET_KEY = os.getenv("SECRET_KEY")
API_KEY = os.getenv("API_KEY")
