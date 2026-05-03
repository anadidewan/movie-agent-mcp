"""
app/config.py — Application configuration via pydantic-settings.

Loads environment variables (and .env file in dev) at startup.
Fails fast with a clear ValidationError if required vars are missing.
GEMINI_API_KEY is stored as SecretStr to prevent accidental logging.

Uses python-dotenv to explicitly load the .env file before pydantic-settings
reads env vars, ensuring it works regardless of the working directory.
"""

from pathlib import Path

from dotenv import load_dotenv
from pydantic import AnyHttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

import structlog

logger = structlog.get_logger(__name__)

# Resolve .env relative to this file's directory (agent_backend/app/config.py)
# so it finds agent_backend/.env regardless of where uvicorn is launched from.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

# Load .env into os.environ BEFORE pydantic-settings reads them.
# override=False means real env vars still take precedence over .env values.
logger.debug("loading_dotenv", path=str(_ENV_FILE), exists=_ENV_FILE.exists())
load_dotenv(_ENV_FILE, override=False)


class Settings(BaseSettings):
    # Required — service refuses to start if absent or empty
    gemini_api_key: SecretStr
    mcp_base_url: AnyHttpUrl

    # Optional with sensible defaults
    frontend_origin: str = "http://localhost:5173"
    version: str = "0.1.0"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def gemini_api_key_must_not_be_empty(cls, v):
        raw = v.get_secret_value() if hasattr(v, "get_secret_value") else str(v)
        if not raw.strip():
            raise ValueError("GEMINI_API_KEY must not be empty")
        return v

    @field_validator("log_level")
    @classmethod
    def log_level_must_be_valid(cls, v: str) -> str:
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid:
            raise ValueError(f"LOG_LEVEL must be one of {valid}, got '{v}'")
        return upper
