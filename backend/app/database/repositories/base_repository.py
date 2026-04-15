from sqlalchemy.orm import Session
from typing import Type, TypeVar, Generic, List, Optional
from app.logger import logger

T = TypeVar('T')

class BaseRepository(Generic[T]):
    def __init__(self, session: Session, model: Type[T]):
        self.session = session
        self.model = model

    def get_by_id(self, id: int) -> Optional[T]:
        return self.session.query(self.model).filter(self.model.id == id).first()

    def get_all(self) -> List[T]:
        return self.session.query(self.model).all()

    def create(self, obj: T) -> T:
        logger.debug(f"Creating object in {self.model.__tablename__}")
        self.session.add(obj)
        self.session.commit()
        self.session.refresh(obj)
        logger.debug(f"Object created successfully in {self.model.__tablename__}")
        return obj

    def update(self, obj: T) -> T:
        self.session.commit()
        self.session.refresh(obj)
        return obj

    def delete(self, obj: T) -> None:
        self.session.delete(obj)
        self.session.commit()