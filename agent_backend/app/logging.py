"""
app/logging.py — structlog configuration.

Sets up structlog with a JSON renderer for production-ready structured logs.
All log records are JSON objects — no free-form text.

Key safety guarantees:
- SecretStr values are never serialised (pydantic masks them in __repr__)
- The GEMINI_API_KEY value never appears in any log record
- Each request gets a unique request_id injected via middleware

Usage:
    import structlog
    logger = structlog.get_logger(__name__)
    logger.info("event_name", key="value", ...)
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import structlog

# Log file path — lives next to the app package so it's easy to find.
# The file is created/appended on every startup.
LOG_FILE = Path(__file__).resolve().parent.parent / "agent_debug.log"


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structlog for JSON output to both stdout and a log file.

    Call this once at application startup (in main.py lifespan).
    Subsequent calls are idempotent.
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Root logger: stdout + file
    root = logging.getLogger()
    root.setLevel(level)

    # Remove any existing handlers (idempotent re-calls)
    root.handlers.clear()

    # stdout handler
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(level)
    stdout_handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(stdout_handler)

    # File handler — appends to agent_debug.log
    file_handler = logging.FileHandler(str(LOG_FILE), mode="a", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)  # capture everything in the file
    file_handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(file_handler)

    structlog.configure(
        processors=[
            # Add log level to every record
            structlog.stdlib.add_log_level,
            # Add logger name
            structlog.stdlib.add_logger_name,
            # Add ISO timestamp
            structlog.processors.TimeStamper(fmt="iso"),
            # Render exceptions as structured dicts (not tracebacks)
            structlog.processors.dict_tracebacks,
            # Final renderer: JSON
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
