from sqlalchemy.orm import Session
from app.models import User
from .base_repository import BaseRepository

class UserRepository(BaseRepository[User]):
    def __init__(self, session: Session):
        super().__init__(session, User)

    def get_by_username(self, username: str) -> User:
        return self.session.query(User).filter(User.username == username).first()

    def get_by_email(self, email: str) -> User:
        return self.session.query(User).filter(User.email == email).first()