from sqlalchemy.orm import Session
from app.models import Card
from .base_repository import BaseRepository

class CardRepository(BaseRepository[Card]):
    def __init__(self, session: Session):
        super().__init__(session, Card)