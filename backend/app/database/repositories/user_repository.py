from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import User
from .base_repository import BaseRepository

class UserRepository(BaseRepository[User]):
    def __init__(self, session: Session):
        super().__init__(session, User)

    def get_by_username(self, username: str) -> User:
        normalized_username = (username or "").strip().lower()
        return self.session.query(User).filter(func.lower(User.username) == normalized_username).first()

    def get_by_email(self, email: str) -> User:
        normalized_email = (email or "").strip().lower()
        return self.session.query(User).filter(func.lower(User.email) == normalized_email).first()
