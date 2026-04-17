from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database.connection import get_db
from app.models import User
from app.services.auth_service import authenticate_user, create_access_token, get_password_hash
from app.database.repositories.user_repository import UserRepository
from app.logger import logger

router = APIRouter(prefix="/auth", tags=["auth"])

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str  # Can be username or email
    password: str

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
