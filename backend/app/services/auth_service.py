import os
from datetime import datetime, timedelta

from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.env import load_environment
from app.models import User
from app.database.repositories.user_repository import UserRepository
from app.logger import logger, update_log_context

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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    plain_password = plain_password[:72]  # Truncate to match hash
    result = pwd_context.verify(plain_password, hashed_password)
    logger.debug(f"Password verification: result={result}")
    return result

def get_password_hash(password):
    # Truncate password to 72 bytes to comply with bcrypt limit
    password = password[:72]
    hashed = pwd_context.hash(password)
    logger.debug(f"Password hashed successfully")
    return hashed

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(db: Session, identifier: str, password: str):
    logger.info(f"Authenticating user: {identifier}")
    repo = UserRepository(db)
    if '@' in identifier:
        user = repo.get_by_email(identifier)
        logger.debug(f"Looking up by email: {identifier}")
    else:
        user = repo.get_by_username(identifier)
        logger.debug(f"Looking up by username: {identifier}")
    if not user:
        logger.warning(f"User not found: {identifier}")
        return False
    logger.debug(f"User found: {user.username}")
    if not verify_password(password, user.password_hash):
        logger.warning(f"Password verification failed for user: {user.username}")
        return False
    logger.info(f"Authentication successful for user: {user.username}")
    return user

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    repo = UserRepository(db)
    user = repo.get_by_username(username)
    if user is None:
        raise credentials_exception
    update_log_context(
        user_id=user.id,
        username=user.username,
        user_role=get_user_role(user),
    )
    return user


def get_user_role(user: User) -> str:
    return (user.role or "player").strip().lower()


def require_admin_user(current_user: User = Depends(get_current_user)):
    if get_user_role(current_user) != "admin":
        logger.warning(
            "Admin access denied",
            extra={
                "event": "admin_access_denied",
                "user_id": current_user.id,
                "username": current_user.username,
                "user_role": get_user_role(current_user),
            },
        )
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

