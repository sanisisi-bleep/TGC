import logging
import sys
from pathlib import Path

# Create logs directory if it doesn't exist
logs_dir = Path(__file__).parent / "logs"
logs_dir.mkdir(exist_ok=True)

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

# File handler for all levels
file_handler = logging.FileHandler(logs_dir / "app.log")
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(formatter)

# Error file handler
error_handler = logging.FileHandler(logs_dir / "error.log")
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(formatter)

# Add handlers to logger
logger.addHandler(console_handler)
logger.addHandler(file_handler)
logger.addHandler(error_handler)

# Prevent duplicate logs
logger.propagate = False