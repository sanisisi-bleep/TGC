import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models import User
from app.database.repositories.user_repository import UserRepository
from app.logger import logger

SECRET_KEY = os.getenv("SECRET_KEY", "kWmQ0x6vQd8TQJ9gM3m0Rz8lQ2n7vF4lB1zYcUoR9pA")
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
        expire = datetime.utcnow() + timedelta(minutes=15)
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
    return user

