import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator
from app.database.connection import get_db
from app.models import User
from app.services.auth_service import authenticate_user, create_access_token, get_password_hash
from app.database.repositories.user_repository import UserRepository
from app.logger import logger

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: Annotated[str, StringConstraints(min_length=3, max_length=50)]
    email: Annotated[str, StringConstraints(min_length=5, max_length=100)]
    password: Annotated[str, StringConstraints(min_length=8, max_length=72)]

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("Username may only contain letters, numbers, dots, hyphens, and underscores")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized_email = value.lower()
        if not EMAIL_PATTERN.fullmatch(normalized_email):
            raise ValueError("Invalid email format")
        return normalized_email

class UserLogin(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: Annotated[str, StringConstraints(min_length=3, max_length=100)]  # Can be username or email
    password: Annotated[str, StringConstraints(min_length=1, max_length=72)]

    @field_validator("username")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        if "@" in value:
            normalized_email = value.lower()
            if not EMAIL_PATTERN.fullmatch(normalized_email):
                raise ValueError("Invalid email format")
            return normalized_email

        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("Invalid username format")

        return value

@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    logger.info(f"Registering user: {user.username}, email: {user.email}")
    repo = UserRepository(db)
    if repo.get_by_username(user.username) or repo.get_by_email(user.email):
        logger.warning(f"User already exists: {user.username} or {user.email}")
        raise HTTPException(status_code=400, detail="Username or email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        display_name=user.username,
        role="player",
    )
    try:
        repo.create(new_user)
        logger.info(f"User registered successfully: {user.username}")
        return {"message": "User created"}
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/token")
def login(user: UserLogin, db: Session = Depends(get_db)):
    logger.info(f"Login attempt for: {user.username}")
    user_obj = authenticate_user(db, user.username, user.password)
    if not user_obj:
        logger.warning(f"Login failed for: {user.username}")
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user_obj.username})
    logger.info(f"Login successful for: {user.username}")
    return {"access_token": access_token, "token_type": "bearer"}
