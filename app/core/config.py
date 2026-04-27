from dotenv import load_dotenv
import os
import re

from dbwarden import database_config

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
dotenv_path = os.path.join(PROJECT_ROOT, ".env")
load_dotenv(dotenv_path)

ENVIRONMENT = os.getenv("ENVIRONMENT", "DEV")


def _to_async_url(url: str) -> str:
    """Force asyncpg driver on any postgresql URL variant."""
    return re.sub(r"^postgresql(\+\w+)?://", "postgresql+asyncpg://", url)


if ENVIRONMENT == "PROD":
    _db_url = os.getenv("DATABASE_URL")
    if not _db_url:
        raise RuntimeError("DATABASE_URL is required when ENVIRONMENT=PROD")
    DATABASE_URL = _to_async_url(_db_url)
else:
    _db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/fingdb.db")
    DATABASE_URL = _to_async_url(_db_url) if _db_url.startswith("postgresql") else _db_url

database_config(
    database_name="primary",
    default=True,
    database_type="postgresql",
    database_url=os.getenv("DATABASE_URL", ""),
    dev_database_type="sqlite",
    dev_database_url="sqlite+aiosqlite:///./data/fingdb.db",
)

ADMIN_USER = os.getenv("ADMIN_USER")
ADMIN_PSWD = os.getenv("ADMIN_PSWD")
SECRET_KEY = os.getenv("SECRET_KEY")
API_KEY = os.getenv("API_KEY")
