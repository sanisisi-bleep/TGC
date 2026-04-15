from sqlalchemy.orm import Session
from app.models import UserCollection
from .base_repository import BaseRepository

class UserCollectionRepository(BaseRepository[UserCollection]):
    def __init__(self, session: Session):
        super().__init__(session, UserCollection)

    def get_by_user_id(self, user_id: int):
        return self.session.query(UserCollection).filter(UserCollection.user_id == user_id).all()

    def get_by_user_and_card(self, user_id: int, card_id: int):
        return self.session.query(UserCollection).filter(
            UserCollection.user_id == user_id,
            UserCollection.card_id == card_id
        ).first()