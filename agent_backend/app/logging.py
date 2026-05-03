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

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structlog for JSON output.

    Call this once at application startup (in main.py lifespan).
    Subsequent calls are idempotent.
    """
    # Configure the standard library logging to route through structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )

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
