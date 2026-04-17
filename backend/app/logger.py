import logging
import os
import sys


def _resolve_log_level():
    level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    return getattr(logging, level_name, logging.INFO)


logger = logging.getLogger("tgc_app")
logger.setLevel(_resolve_log_level())

if not logger.handlers:
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s"
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(_resolve_log_level())
    console_handler.setFormatter(formatter)

    logger.addHandler(console_handler)

logger.propagate = False
