from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database.connection import get_db
from app.services.card_service import CardService
from app.services.auth_service import get_current_user
from app.models import User

router = APIRouter(prefix="/cards", tags=["cards"])

class CardCreate(BaseModel):
    tgc_id: int
    name: str
    card_type: str = None
    lv: int = None
    cost: int = None
    ap: int = None
    hp: int = None
    color: str = None
    rarity: str = None
    set_name: str = None
    version: str = None
    abilities: str = None
    description: str = None
    image_url: str = None

@router.get("")
def get_cards(tgc_id: Optional[int] = None, db: Session = Depends(get_db)):
    service = CardService(db)
    return service.get_all_cards(tgc_id)

@router.post("")
def create_card(card: CardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = CardService(db)
    return service.create_card(**card.dict())

@router.get("/collection_card")
def get_collection(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = CardService(db)
    return service.get_user_collection(current_user.id)

@router.post("/collection_card")
def add_to_collection(card_id: int, quantity: int = 1, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = CardService(db)
    return service.add_to_collection(current_user.id, card_id, quantity)
