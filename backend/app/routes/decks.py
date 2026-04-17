from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database.connection import get_db
from app.services.deck_service import DeckService
from app.services.auth_service import get_current_user
from app.models import User

router = APIRouter(prefix="/decks", tags=["decks"])

class DeckCreate(BaseModel):
    name: str
    tgc_id: Optional[int] = None

class DeckRename(BaseModel):
    name: str

class DeckCardCreate(BaseModel):
    card_id: int
    quantity: int


class DeckCardAdjust(BaseModel):
    delta: int


class DeckCardAssignmentAdjust(BaseModel):
    delta: int

@router.get("")
def get_decks(tgc_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    return service.get_user_decks(current_user.id, tgc_id)

@router.get("/{deck_id}")
def get_deck_details(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        return service.get_deck_details(deck_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/shared/{share_token}")
def get_shared_deck(share_token: str, db: Session = Depends(get_db)):
    service = DeckService(db)
    try:
        return service.get_shared_deck(share_token)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("")
def create_deck(deck: DeckCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    return service.create_deck(current_user.id, deck.name, deck.tgc_id)

@router.patch("/{deck_id}")
def rename_deck(deck_id: int, payload: DeckRename, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        deck = service.rename_deck(deck_id, current_user.id, payload.name)
        return {
            "message": "Deck renamed",
            "deck_id": deck.id,
            "name": deck.name,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{deck_id}")
def delete_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        deleted = service.delete_deck(deck_id, current_user.id)
        return {
            "message": "Deck deleted",
            "deck_id": deleted.id,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{deck_id}/clone")
def clone_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        cloned = service.clone_deck(deck_id, current_user.id)
        return {
            "message": "Deck cloned",
            "deck_id": cloned.id,
            "name": cloned.name,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{deck_id}/share")
def share_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        deck = service.ensure_share_token(deck_id, current_user.id)
        return {
            "message": "Deck share link ready",
            "deck_id": deck.id,
            "share_token": deck.share_token,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{deck_id}/cards")
def add_card_to_deck(deck_id: int, card: DeckCardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        return service.add_card_to_deck(deck_id, card.card_id, card.quantity, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{deck_id}/cards/{card_id}/adjust")
def adjust_card_in_deck(deck_id: int, card_id: int, payload: DeckCardAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        result = service.adjust_deck_card_quantity(deck_id, card_id, payload.delta, current_user.id)
        return {
            "message": "Deck quantity updated",
            "deck_id": deck_id,
            "card_id": card_id,
            "quantity": result.quantity if result else 0,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{deck_id}/cards/{card_id}/assignment")
def adjust_card_assignment_in_deck(deck_id: int, card_id: int, payload: DeckCardAssignmentAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = DeckService(db)
    try:
        result = service.adjust_deck_card_assignment(deck_id, card_id, payload.delta, current_user.id)
        return {
            "message": "Deck assignment updated",
            "deck_id": deck_id,
            "card_id": card_id,
            "assigned_quantity": result.assigned_quantity,
            "quantity": result.quantity,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
