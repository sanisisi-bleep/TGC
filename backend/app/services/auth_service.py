import os
from datetime import datetime, timedelta

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.env import load_environment
from app.models import User
from app.database.repositories.user_repository import UserRepository
from app.logger import build_log_extra, logger, mask_identifier, update_log_context

load_environment()


def resolve_secret_key():
    secret_key = os.getenv("SECRET_KEY")
    if secret_key:
        return secret_key

    if os.getenv("VERCEL") == "1":
        raise RuntimeError("SECRET_KEY must be set for Vercel deployments.")

    return "dev-only-secret-key-change-me"


SECRET_KEY = resolve_secret_key()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "tgc_session").strip() or "tgc_session"
AUTH_COOKIE_SAMESITE = (os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower() or "lax")
AUTH_COOKIE_MAX_AGE_SECONDS = max(ACCESS_TOKEN_EXPIRE_MINUTES, 1) * 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _is_cookie_secure():
    raw_value = os.getenv("AUTH_COOKIE_SECURE")
    if raw_value is None:
        return os.getenv("VERCEL") == "1"
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_cookie_samesite():
    if AUTH_COOKIE_SAMESITE in {"lax", "strict", "none"}:
        return AUTH_COOKIE_SAMESITE
    return "lax"


def _apply_auth_response_headers(response: Response):
    response.headers["Cache-Control"] = "no-store"


def set_auth_cookie(response: Response, access_token: str):
    _apply_auth_response_headers(response)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=_is_cookie_secure(),
        samesite=_resolve_cookie_samesite(),
        max_age=AUTH_COOKIE_MAX_AGE_SECONDS,
        expires=AUTH_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )


def clear_auth_cookie(response: Response):
    _apply_auth_response_headers(response)
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
    )


def _classify_identifier(identifier: str) -> str:
    return "email" if "@" in (identifier or "") else "username"


def verify_password(plain_password, hashed_password):
    plain_password = plain_password[:72]  # Truncate to match hash
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    # Truncate password to 72 bytes to comply with bcrypt limit
    password = password[:72]
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(db: Session, identifier: str, password: str):
    repo = UserRepository(db)
    identifier_type = _classify_identifier(identifier)
    masked_identifier = mask_identifier(identifier)

    logger.debug(
        "Authenticating user",
        extra=build_log_extra(
            "auth_lookup_started",
            identifier_type=identifier_type,
            identifier=masked_identifier,
        ),
    )

    if identifier_type == "email":
        user = repo.get_by_email(identifier)
    else:
        user = repo.get_by_username(identifier)

    if not user:
        logger.debug(
            "Authentication lookup missed user",
            extra=build_log_extra(
                "auth_lookup_user_missing",
                identifier_type=identifier_type,
                identifier=masked_identifier,
            ),
        )
        return False

    if not verify_password(password, user.password_hash):
        logger.debug(
            "Authentication password verification failed",
            extra=build_log_extra(
                "auth_password_verification_failed",
                user_id=user.id,
                username=user.username,
            ),
        )
        return False

    logger.debug(
        "Authentication lookup succeeded",
        extra=build_log_extra(
            "auth_lookup_success",
            user_id=user.id,
            username=user.username,
        ),
    )
    return user

def _resolve_request_token(request: Request, bearer_token: str | None):
    if bearer_token:
        return bearer_token
    return request.cookies.get(AUTH_COOKIE_NAME)


def _resolve_user_from_request(request: Request, bearer_token: str | None, db: Session):
    resolved_token = _resolve_request_token(request, bearer_token)
    if not resolved_token:
        return None

    try:
        payload = jwt.decode(resolved_token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_type = payload.get("type")
        if username is None or token_type != "access":
            return None
    except JWTError:
        return None

    repo = UserRepository(db)
    user = repo.get_by_username(username)
    if user is None:
        return None

    update_log_context(
        user_id=user.id,
        username=user.username,
        user_role=get_user_role(user),
    )
    return user


def get_current_user_optional(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    return _resolve_user_from_request(request, token, db)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user = _resolve_user_from_request(request, token, db)
    if user is None:
        raise credentials_exception
    return user


def get_user_role(user: User) -> str:
    return (user.role or "player").strip().lower()


def require_admin_user(current_user: User = Depends(get_current_user)):
    if get_user_role(current_user) != "admin":
        logger.warning(
            "Admin access denied",
            extra=build_log_extra(
                "admin_access_denied",
                user_id=current_user.id,
                username=current_user.username,
                user_role=get_user_role(current_user),
            ),
        )
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

