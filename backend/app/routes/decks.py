from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
from app.database.connection import get_db
from app.logger import build_log_extra, logger
from app.services.deck_service import DeckService
from app.services.auth_service import get_current_user
from app.models import User

router = APIRouter(prefix="/decks", tags=["decks"])
SHARED_DECK_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600"


class DeckCreate(BaseModel):
    name: str
    tgc_id: Optional[int] = None


class DeckRename(BaseModel):
    name: str


class DeckCardCreate(BaseModel):
    card_id: int
    quantity: int = Field(..., gt=0)


class DeckConsideringCreate(BaseModel):
    card_id: int
    quantity: int = Field(..., gt=0)


class DeckCardAdjust(BaseModel):
    delta: int


class DeckCardAssignmentAdjust(BaseModel):
    delta: int


class DeckConsideringAdjust(BaseModel):
    delta: int


class DeckCardTransfer(BaseModel):
    quantity: int = Field(..., gt=0)


class DeckImportCard(BaseModel):
    card_id: Optional[int] = None
    source_card_id: Optional[str] = None
    version: Optional[str] = None
    quantity: int = Field(..., gt=0)


class DeckImportPayload(BaseModel):
    name: Optional[str] = None
    tgc_id: Optional[int] = None
    cards: List[DeckImportCard] = Field(default_factory=list)
    egg_cards: List[DeckImportCard] = Field(default_factory=list)


def _deck_service(db: Session) -> DeckService:
    return DeckService(db)


def _raise_deck_http_error(status_code: int, error: ValueError, event: str | None = None, **context):
    if event:
        logger.warning(
            "Deck operation rejected",
            extra=build_log_extra(
                event,
                status_code=status_code,
                error=str(error),
                **context,
            ),
        )
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
        _raise_deck_http_error(
            404,
            error,
            event="deck_detail_lookup_failed",
            deck_id=deck_id,
            user_id=current_user.id,
            username=current_user.username,
        )


@router.get("/shared/{share_token}")
def get_shared_deck(share_token: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = SHARED_DECK_CACHE_CONTROL
    service = _deck_service(db)
    try:
        return service.get_shared_deck(share_token)
    except ValueError as error:
        _raise_deck_http_error(
            404,
            error,
            event="shared_deck_lookup_failed",
            share_token_present=bool(share_token),
        )


@router.post("")
def create_deck(deck: DeckCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    created_deck = service.create_deck(current_user.id, deck.name, deck.tgc_id)
    logger.info(
        "Deck created",
        extra=build_log_extra(
            "deck_created",
            deck_id=created_deck.id,
            user_id=current_user.id,
            username=current_user.username,
            tgc_id=created_deck.tgc_id,
        ),
    )
    return service.get_deck_summary(created_deck.id, current_user.id)


@router.post("/import")
def import_deck(payload: DeckImportPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deck = service.import_deck(
            current_user.id,
            payload.name,
            payload.tgc_id,
            [card.dict() for card in payload.cards],
            [card.dict() for card in payload.egg_cards],
        )
        logger.info(
            "Deck imported",
            extra=build_log_extra(
                "deck_imported",
                deck_id=deck.id,
                user_id=current_user.id,
                username=current_user.username,
                imported_cards=len(payload.cards),
                imported_egg_cards=len(payload.egg_cards),
                tgc_id=payload.tgc_id,
            ),
        )
        return _deck_name_payload("Deck imported", deck)
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_import_rejected",
            user_id=current_user.id,
            username=current_user.username,
            imported_cards=len(payload.cards),
            imported_egg_cards=len(payload.egg_cards),
            tgc_id=payload.tgc_id,
        )


@router.patch("/{deck_id}")
def rename_deck(deck_id: int, payload: DeckRename, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deck = service.rename_deck(deck_id, current_user.id, payload.name)
        logger.info(
            "Deck renamed",
            extra=build_log_extra(
                "deck_renamed",
                deck_id=deck.id,
                user_id=current_user.id,
                username=current_user.username,
                deck_name=deck.name,
            ),
        )
        return _deck_name_payload("Deck renamed", deck)
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_rename_rejected",
            deck_id=deck_id,
            user_id=current_user.id,
            username=current_user.username,
        )


@router.delete("/{deck_id}")
def delete_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deleted = service.delete_deck(deck_id, current_user.id)
        logger.info(
            "Deck deleted",
            extra=build_log_extra(
                "deck_deleted",
                deck_id=deleted.id,
                user_id=current_user.id,
                username=current_user.username,
                deck_name=deleted.name,
            ),
        )
        return {
            "message": "Deck deleted",
            "deck_id": deleted.id,
        }
    except ValueError as error:
        _raise_deck_http_error(
            404,
            error,
            event="deck_delete_rejected",
            deck_id=deck_id,
            user_id=current_user.id,
            username=current_user.username,
        )


@router.post("/{deck_id}/clone")
def clone_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        cloned = service.clone_deck(deck_id, current_user.id)
        logger.info(
            "Deck cloned",
            extra=build_log_extra(
                "deck_cloned",
                deck_id=cloned.id,
                source_deck_id=deck_id,
                user_id=current_user.id,
                username=current_user.username,
            ),
        )
        return _deck_name_payload("Deck cloned", cloned)
    except ValueError as error:
        _raise_deck_http_error(
            404,
            error,
            event="deck_clone_rejected",
            deck_id=deck_id,
            user_id=current_user.id,
            username=current_user.username,
        )


@router.post("/{deck_id}/share")
def share_deck(deck_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        deck = service.ensure_share_token(deck_id, current_user.id)
        logger.info(
            "Deck share token ensured",
            extra=build_log_extra(
                "deck_share_token_ensured",
                deck_id=deck.id,
                user_id=current_user.id,
                username=current_user.username,
                share_token_present=bool(deck.share_token),
            ),
        )
        return {
            "message": "Deck share link ready",
            "deck_id": deck.id,
            "share_token": deck.share_token,
        }
    except ValueError as error:
        _raise_deck_http_error(
            404,
            error,
            event="deck_share_rejected",
            deck_id=deck_id,
            user_id=current_user.id,
            username=current_user.username,
        )


@router.post("/{deck_id}/cards")
def add_card_to_deck(deck_id: int, card: DeckCardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.add_card_to_deck(deck_id, card.card_id, card.quantity, current_user.id)
        logger.info(
            "Card added to deck",
            extra=build_log_extra(
                "deck_card_added",
                deck_id=deck_id,
                card_id=card.card_id,
                user_id=current_user.id,
                username=current_user.username,
                quantity=result["quantity"],
                delta=card.quantity,
                assigned_quantity=result["assigned_quantity"],
            ),
        )
        return _deck_card_payload(
            "Card added to deck",
            deck_id,
            card.card_id,
            quantity=result["quantity"],
            assigned_quantity=result["assigned_quantity"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_card_add_rejected",
            deck_id=deck_id,
            card_id=card.card_id,
            user_id=current_user.id,
            username=current_user.username,
            delta=card.quantity,
        )


@router.post("/{deck_id}/considering")
def add_card_to_considering(deck_id: int, card: DeckConsideringCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.add_card_to_considering(deck_id, card.card_id, card.quantity, current_user.id)
        logger.info(
            "Card added to considering",
            extra=build_log_extra(
                "deck_considering_card_added",
                deck_id=deck_id,
                card_id=card.card_id,
                user_id=current_user.id,
                username=current_user.username,
                quantity=result["quantity"],
                delta=card.quantity,
            ),
        )
        return _deck_card_payload(
            "Card added to considering",
            deck_id,
            card.card_id,
            quantity=result["quantity"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_considering_card_add_rejected",
            deck_id=deck_id,
            card_id=card.card_id,
            user_id=current_user.id,
            username=current_user.username,
            delta=card.quantity,
        )


@router.post("/{deck_id}/cards/{card_id}/adjust")
def adjust_card_in_deck(deck_id: int, card_id: int, payload: DeckCardAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.adjust_deck_card_quantity(deck_id, card_id, payload.delta, current_user.id)
        logger.info(
            "Deck card quantity adjusted",
            extra=build_log_extra(
                "deck_card_quantity_adjusted",
                deck_id=deck_id,
                card_id=card_id,
                user_id=current_user.id,
                username=current_user.username,
                delta=payload.delta,
                quantity=result["quantity"],
                assigned_quantity=result["assigned_quantity"],
            ),
        )
        return _deck_card_payload(
            "Deck quantity updated",
            deck_id,
            card_id,
            quantity=result["quantity"],
            assigned_quantity=result["assigned_quantity"],
            deck=result["deck"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_card_quantity_adjust_rejected",
            deck_id=deck_id,
            card_id=card_id,
            user_id=current_user.id,
            username=current_user.username,
            delta=payload.delta,
        )


@router.post("/{deck_id}/considering/{card_id}/adjust")
def adjust_card_in_considering(deck_id: int, card_id: int, payload: DeckConsideringAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.adjust_considering_card_quantity(deck_id, card_id, payload.delta, current_user.id)
        logger.info(
            "Considering card quantity adjusted",
            extra=build_log_extra(
                "deck_considering_card_adjusted",
                deck_id=deck_id,
                card_id=card_id,
                user_id=current_user.id,
                username=current_user.username,
                delta=payload.delta,
                quantity=result["quantity"],
            ),
        )
        return _deck_card_payload(
            "Considering quantity updated",
            deck_id,
            card_id,
            quantity=result["quantity"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_considering_card_adjust_rejected",
            deck_id=deck_id,
            card_id=card_id,
            user_id=current_user.id,
            username=current_user.username,
            delta=payload.delta,
        )


@router.post("/{deck_id}/cards/{card_id}/assignment")
def adjust_card_assignment_in_deck(deck_id: int, card_id: int, payload: DeckCardAssignmentAdjust, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.adjust_deck_card_assignment(deck_id, card_id, payload.delta, current_user.id)
        logger.info(
            "Deck card assignment adjusted",
            extra=build_log_extra(
                "deck_card_assignment_adjusted",
                deck_id=deck_id,
                card_id=card_id,
                user_id=current_user.id,
                username=current_user.username,
                delta=payload.delta,
                quantity=result["quantity"],
                assigned_quantity=result["assigned_quantity"],
            ),
        )
        return _deck_card_payload(
            "Deck assignment updated",
            deck_id,
            card_id,
            assigned_quantity=result["assigned_quantity"],
            quantity=result["quantity"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_card_assignment_adjust_rejected",
            deck_id=deck_id,
            card_id=card_id,
            user_id=current_user.id,
            username=current_user.username,
            delta=payload.delta,
        )


@router.post("/{deck_id}/cards/{card_id}/move-to-considering")
def move_card_to_considering(deck_id: int, card_id: int, payload: DeckCardTransfer, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.move_card_to_considering(deck_id, card_id, payload.quantity, current_user.id)
        logger.info(
            "Card moved from main deck to considering",
            extra=build_log_extra(
                "deck_card_moved_to_considering",
                deck_id=deck_id,
                card_id=card_id,
                user_id=current_user.id,
                username=current_user.username,
                quantity=payload.quantity,
                deck_quantity=result["deck_quantity"],
                considering_quantity=result["considering_quantity"],
            ),
        )
        return _deck_card_payload(
            "Card moved to considering",
            deck_id,
            card_id,
            quantity=result["deck_quantity"],
            considering_quantity=result["considering_quantity"],
            assigned_quantity=result["assigned_quantity"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_card_move_to_considering_rejected",
            deck_id=deck_id,
            card_id=card_id,
            user_id=current_user.id,
            username=current_user.username,
            quantity=payload.quantity,
        )


@router.post("/{deck_id}/considering/{card_id}/move-to-main")
def move_card_to_main_deck(deck_id: int, card_id: int, payload: DeckCardTransfer, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = _deck_service(db)
    try:
        result = service.move_card_from_considering_to_deck(deck_id, card_id, payload.quantity, current_user.id)
        logger.info(
            "Card moved from considering to main deck",
            extra=build_log_extra(
                "deck_card_moved_from_considering",
                deck_id=deck_id,
                card_id=card_id,
                user_id=current_user.id,
                username=current_user.username,
                quantity=payload.quantity,
                deck_quantity=result["deck_quantity"],
                considering_quantity=result["considering_quantity"],
            ),
        )
        return _deck_card_payload(
            "Card moved to main deck",
            deck_id,
            card_id,
            quantity=result["deck_quantity"],
            considering_quantity=result["considering_quantity"],
            assigned_quantity=result["assigned_quantity"],
        )
    except ValueError as error:
        _raise_deck_http_error(
            400,
            error,
            event="deck_card_move_from_considering_rejected",
            deck_id=deck_id,
            card_id=card_id,
            user_id=current_user.id,
            username=current_user.username,
            quantity=payload.quantity,
        )
