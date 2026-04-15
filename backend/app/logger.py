import logging
import sys

# Configure logger
logger = logging.getLogger("tgc_app")
logger.setLevel(logging.DEBUG)

# Create formatters
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s"
)

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)

if not logger.handlers:
    logger.addHandler(console_handler)

# Prevent duplicate logs
logger.propagate = False
