from sqlalchemy.orm import Session
from app.models import Tgc
from .base_repository import BaseRepository

class TgcRepository(BaseRepository[Tgc]):
    def __init__(self, session: Session):
        super().__init__(session, Tgc)