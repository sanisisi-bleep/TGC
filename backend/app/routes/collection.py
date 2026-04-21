from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database.connection import get_db
from app.logger import logger
from app.services.auth_service import get_current_user
from app.services.card_service import CardService
from app.models import User, UserCollection, Card
from app.database.repositories.user_collection_repository import UserCollectionRepository

router = APIRouter(prefix="/collection", tags=["collection"])

class CollectionAdd(BaseModel):
    card_id: int
    quantity: int = Field(1, gt=0)


class CollectionAdjust(BaseModel):
    delta: int = Field(..., ne=0)

@router.get("")
def get_user_collection(
    tgc_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    service = CardService(db)
    return service.get_user_collection(current_user.id, tgc_id)

@router.post("", status_code=status.HTTP_200_OK)
def add_to_collection(
    item: CollectionAdd = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logger.debug(
        "add_to_collection user=%s card_id=%s quantity=%s",
        current_user.username,
        item.card_id,
        item.quantity,
    )

    card = db.query(Card).filter(Card.id == item.card_id).first()
    if not card:
        raise HTTPException(
            status_code=404,
            detail=f"Card with id {item.card_id} not found"
        )

    repo = UserCollectionRepository(db)
    existing = repo.get_by_user_and_card(current_user.id, item.card_id)

    if existing:
        existing.quantity += item.quantity
        repo.update(existing)
        return {
            "message": "Card quantity updated in collection",
            "card_id": item.card_id,
            "quantity": existing.quantity
        }

    collection_item = UserCollection(
        user_id=current_user.id,
        card_id=item.card_id,
        quantity=item.quantity
    )
    repo.create(collection_item)

    return {
        "message": "Added to collection",
        "card_id": item.card_id,
        "quantity": item.quantity
    }


@router.post("/{card_id}/adjust", status_code=status.HTTP_200_OK)
def adjust_collection_quantity(
    card_id: int,
    item: CollectionAdjust = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    service = CardService(db)
    try:
        collection = service.adjust_collection_quantity(current_user.id, card_id, item.delta)
        return {
            "message": "Collection quantity updated",
            "card_id": card_id,
            "quantity": collection.quantity if collection else 0,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
