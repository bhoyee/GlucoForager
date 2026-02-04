import json
import logging
import os
from logging.handlers import TimedRotatingFileHandler


LOG_DIR = os.getenv("LOG_DIR", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_PATH = os.path.join(LOG_DIR, "mobile-client.log")
RETENTION_DAYS = int(os.getenv("MOBILE_LOG_RETENTION_DAYS", "7"))

logger = logging.getLogger("glucoforager.mobile")

if not logger.handlers:
    handler = TimedRotatingFileHandler(
        LOG_PATH,
        when="D",
        interval=1,
        backupCount=RETENTION_DAYS,
        encoding="utf-8",
    )
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def log_mobile_event(event: dict) -> None:
    logger.info(json.dumps(event, ensure_ascii=False))
