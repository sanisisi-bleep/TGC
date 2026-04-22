from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database.connection import get_db
from app.services.card_service import CardService
from app.services.auth_service import get_current_user, require_admin_user
from app.models import User

router = APIRouter(prefix="/cards", tags=["cards"])

CATALOG_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600"
FACETS_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"


def _apply_cache_headers(response: Response, cache_control: str):
    response.headers["Cache-Control"] = cache_control

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
def get_cards(
    response: Response,
    tgc_id: Optional[int] = None,
    search: Optional[str] = Query(None, max_length=100),
    card_type: Optional[str] = Query(None, max_length=50),
    color: Optional[str] = Query(None, max_length=20),
    rarity: Optional[str] = Query(None, max_length=20),
    set_name: Optional[str] = Query(None, max_length=255),
    sort: str = Query("name-asc", max_length=32),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _apply_cache_headers(response, CATALOG_CACHE_CONTROL)
    service = CardService(db)
    return service.get_cards_page(
        tgc_id=tgc_id,
        search=search,
        card_type=card_type,
        color=color,
        rarity=rarity,
        set_name=set_name,
        sort=sort,
        page=page,
        limit=limit,
    )

@router.get("/facets")
def get_card_facets(response: Response, tgc_id: Optional[int] = None, db: Session = Depends(get_db)):
    _apply_cache_headers(response, FACETS_CACHE_CONTROL)
    service = CardService(db)
    return service.get_card_facets(tgc_id)

@router.post("")
def create_card(
    card: CardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
):
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
