import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator
from app.database.connection import get_db
from app.rate_limit import RateLimitPolicy, enforce_rate_limit
from app.models import User
from app.services.auth_service import (
    authenticate_user,
    clear_auth_cookie,
    create_access_token,
    get_password_hash,
    set_auth_cookie,
)
from app.database.repositories.user_repository import UserRepository
from app.logger import logger

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LOGIN_IP_POLICY = RateLimitPolicy(bucket="auth-login-ip", limit=12, window_seconds=10 * 60)
LOGIN_IDENTIFIER_POLICY = RateLimitPolicy(bucket="auth-login-identifier", limit=6, window_seconds=10 * 60)
REGISTER_IP_POLICY = RateLimitPolicy(bucket="auth-register-ip", limit=5, window_seconds=30 * 60)
REGISTER_IDENTIFIER_POLICY = RateLimitPolicy(bucket="auth-register-identifier", limit=3, window_seconds=60 * 60)


def _apply_no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"


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
def register(user: UserCreate, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce_rate_limit(request, REGISTER_IP_POLICY)
    enforce_rate_limit(request, REGISTER_IDENTIFIER_POLICY, key_fragment=user.email)
    _apply_no_store(response)
    logger.info(
        "Registering user",
        extra={"event": "auth_register_attempt", "username": user.username},
    )
    repo = UserRepository(db)
    if repo.get_by_username(user.username) or repo.get_by_email(user.email):
        logger.warning(
            "Registration rejected because user already exists",
            extra={"event": "auth_register_duplicate", "username": user.username},
        )
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
        logger.info(
            "User registered successfully",
            extra={
                "event": "auth_register_success",
                "user_id": new_user.id,
                "username": new_user.username,
            },
        )
        return {"message": "User created"}
    except Exception:
        logger.exception(
            "Error creating user",
            extra={"event": "auth_register_failed", "username": user.username},
        )
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/token")
def login(user: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce_rate_limit(request, LOGIN_IP_POLICY)
    enforce_rate_limit(request, LOGIN_IDENTIFIER_POLICY, key_fragment=user.username)
    logger.info(
        "Login attempt",
        extra={"event": "auth_login_attempt", "identifier": user.username},
    )
    user_obj = authenticate_user(db, user.username, user.password)
    if not user_obj:
        logger.warning(
            "Login failed",
            extra={"event": "auth_login_failed", "identifier": user.username},
        )
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(data={"sub": user_obj.username})
    set_auth_cookie(response, access_token)
    logger.info(
        "Login successful",
        extra={
            "event": "auth_login_success",
            "user_id": user_obj.id,
            "username": user_obj.username,
        },
    )
    return {"message": "Login successful", "authenticated": True}


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logout successful"}
