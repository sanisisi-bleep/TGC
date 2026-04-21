from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
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
    quantity: int = Field(..., gt=0)


class DeckCardAdjust(BaseModel):
    delta: int


class DeckCardAssignmentAdjust(BaseModel):
    delta: int


class DeckImportCard(BaseModel):
    card_id: Optional[int] = None
    source_card_id: Optional[str] = None
    version: Optional[str] = None
    quantity: int = Field(..., gt=0)


class DeckImportPayload(BaseModel):
    name: Optional[str] = None
    tgc_id: Optional[int] = None
    cards: List[DeckImportCard] = Field(default_factory=list)


def _deck_service(db: Session) -> DeckService:
    return DeckService(db)


def _raise_deck_http_error(status_code: int, error: ValueError):
    raise HTTPException(status_code=status_code, detail=str(error)) from error


def _deck_name_payload(message: str, deck):
    return {
        "message": message,
        "deck_id": deck.id,
        "name": deck.name,
    }


def _deck_card_payload(message: str, deck_id: int, card_id: int, **extra):
    return {
        "message": message,
        "deck_id": deck_id,
        "card_id": card_id,
        **extra,
    }

@router.get("")
def get_decks(tgc_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    return service.get_user_decks(current_user.id, tgc_id)

@router.get("/{deck_id}")
def get_deck_details(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        return service.get_deck_details(deck_id, current_user.id)
    except ValueError as error:
        _raise_deck_http_error(404, error)

@router.get("/shared/{share_token}")
def get_shared_deck(share_token: str, db: Session = Depends(get_db)):
    service = _deck_service(db)
    try:
        return service.get_shared_deck(share_token)
    except ValueError as error:
        _raise_deck_http_error(404, error)

@router.post("")
def create_deck(deck: DeckCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    return service.create_deck(current_user.id, deck.name, deck.tgc_id)


@router.post("/import")
def import_deck(payload: DeckImportPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deck = service.import_deck(
            current_user.id,
            payload.name,
            payload.tgc_id,
            [card.dict() for card in payload.cards],
        )
        return _deck_name_payload("Deck imported", deck)
    except ValueError as error:
        _raise_deck_http_error(400, error)

@router.patch("/{deck_id}")
def rename_deck(deck_id: int, payload: DeckRename, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deck = service.rename_deck(deck_id, current_user.id, payload.name)
        return _deck_name_payload("Deck renamed", deck)
    except ValueError as error:
        _raise_deck_http_error(400, error)

@router.delete("/{deck_id}")
def delete_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deleted = service.delete_deck(deck_id, current_user.id)
        return {
            "message": "Deck deleted",
            "deck_id": deleted.id,
        }
    except ValueError as error:
        _raise_deck_http_error(404, error)

@router.post("/{deck_id}/clone")
def clone_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        cloned = service.clone_deck(deck_id, current_user.id)
        return _deck_name_payload("Deck cloned", cloned)
    except ValueError as error:
        _raise_deck_http_error(404, error)

@router.post("/{deck_id}/share")
def share_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deck = service.ensure_share_token(deck_id, current_user.id)
        return {
            "message": "Deck share link ready",
            "deck_id": deck.id,
            "share_token": deck.share_token,
        }
    except ValueError as error:
        _raise_deck_http_error(404, error)

@router.post("/{deck_id}/cards")
def add_card_to_deck(deck_id: int, card: DeckCardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        return service.add_card_to_deck(deck_id, card.card_id, card.quantity, current_user.id)
    except ValueError as error:
        _raise_deck_http_error(400, error)


@router.post("/{deck_id}/cards/{card_id}/adjust")
def adjust_card_in_deck(deck_id: int, card_id: int, payload: DeckCardAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.adjust_deck_card_quantity(deck_id, card_id, payload.delta, current_user.id)
        return _deck_card_payload(
            "Deck quantity updated",
            deck_id,
            card_id,
            quantity=result.quantity if result else 0,
        )
    except ValueError as error:
        _raise_deck_http_error(400, error)


@router.post("/{deck_id}/cards/{card_id}/assignment")
def adjust_card_assignment_in_deck(deck_id: int, card_id: int, payload: DeckCardAssignmentAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.adjust_deck_card_assignment(deck_id, card_id, payload.delta, current_user.id)
        return _deck_card_payload(
            "Deck assignment updated",
            deck_id,
            card_id,
            assigned_quantity=result.assigned_quantity,
            quantity=result.quantity,
        )
    except ValueError as error:
        _raise_deck_http_error(400, error)
