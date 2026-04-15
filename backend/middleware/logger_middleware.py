from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import logging
import time
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)

class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Log de la petición
        logging.info(f"REQUEST: {request.method} {request.url}")
        logging.info(f"Headers: {dict(request.headers)}")

        body = b''
        if request.method in {"POST", "PUT", "PATCH"}:
            try:
                body = await request.body()
                logging.info(f"Body: {body}")
            except Exception as exc:
                logging.error(f"Error reading request body: {exc}")

        # Preserve request body for downstream consumers
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request = Request(request.scope, receive)

        response = await call_next(request)

        # Log de la respuesta
        process_time = time.time() - start_time
        logging.info(f"RESPONSE: {response.status_code} in {process_time:.4f}s")
        logging.info(f"Response Headers: {dict(response.headers)}")

        try:
            if hasattr(response, "body"):
                response_body = response.body
                if isinstance(response_body, (bytes, bytearray)):
                    response_body = response_body.decode("utf-8", errors="ignore")
                logging.info(f"Response Body: {response_body}")
        except Exception as exc:
            logging.error(f"Error reading response body: {exc}")

        return response
