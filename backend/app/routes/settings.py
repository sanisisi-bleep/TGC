from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import delete

from app.database.connection import get_db
from app.models import Tgc, User, UserCollection, Deck, DeckCard
from app.services.auth_service import get_current_user, get_password_hash, require_admin_user, verify_password

router = APIRouter(prefix="/settings", tags=["settings"])

ALLOWED_ROLES = {
    "player",
    "trader",
    "store-owner",
    "organizer",
    "admin",
}


class SettingsUpdate(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    advanced_mode: bool | None = None
    favorite_tgc_id: int | None = None
    default_tgc_id: int | None = None


class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str


class AdminRoleUpdate(BaseModel):
    role: str


class DeleteAccountRequest(BaseModel):
    password: str


def _serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name or user.username,
        "role": user.role or "player",
        "bio": user.bio or "",
        "advanced_mode": bool(user.advanced_mode),
        "favorite_tgc_id": user.favorite_tgc_id,
        "default_tgc_id": user.default_tgc_id,
    }


def _ensure_tgc_exists(db: Session, tgc_id: int | None):
    if tgc_id is None:
        return
    exists = db.query(Tgc.id).filter(Tgc.id == tgc_id).first()
    if not exists:
        raise HTTPException(status_code=400, detail="TCG not found")

@router.get("/me")
def get_my_settings(current_user=Depends(get_current_user)):
    return _serialize_user(current_user)


@router.patch("/me")
def update_my_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_tgc_exists(db, payload.favorite_tgc_id)
    _ensure_tgc_exists(db, payload.default_tgc_id)

    current_user.display_name = (payload.display_name or current_user.username).strip()[:100]
    current_user.bio = (payload.bio or "").strip()[:500]
    if payload.advanced_mode is not None:
        current_user.advanced_mode = payload.advanced_mode
    current_user.favorite_tgc_id = payload.favorite_tgc_id
    current_user.default_tgc_id = payload.default_tgc_id

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return _serialize_user(current_user)


@router.post("/password")
def update_password(
    payload: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password or "") < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    current_user.password_hash = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    return {"message": "Password updated"}


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_user),
):
    users = db.query(User).order_by(User.username.asc()).all()
    return [_serialize_user(user) for user in users]


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: AdminRoleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_user),
):
    role = (payload.role or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = role
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.delete("/me")
def delete_my_account(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    owned_deck_ids = [
        deck_id
        for (deck_id,) in db.query(Deck.id).filter(Deck.user_id == current_user.id).all()
    ]

    if owned_deck_ids:
        db.execute(delete(DeckCard).where(DeckCard.deck_id.in_(owned_deck_ids)))
        db.execute(delete(Deck).where(Deck.id.in_(owned_deck_ids)))

    db.execute(delete(UserCollection).where(UserCollection.user_id == current_user.id))
    db.execute(delete(User).where(User.id == current_user.id))
    db.commit()
    return {"message": "Account deleted"}
