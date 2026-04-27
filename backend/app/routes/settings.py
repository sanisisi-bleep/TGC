from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy.orm import Session
from sqlalchemy import delete

from app.database.connection import get_db
from app.models import Tgc, User, UserCollection, Deck, DeckCard, DeckConsideringCard, DeckEggCard
from app.rate_limit import RateLimitPolicy, enforce_rate_limit
from app.services.auth_service import get_current_user, get_password_hash, require_admin_user, verify_password
from app.services.feedback_service import (
    FeedbackConfigurationError,
    FeedbackDeliveryError,
    FeedbackSubmission,
    deliver_feedback_email,
)
from app.logger import build_log_extra, logger

router = APIRouter(prefix="/settings", tags=["settings"])

ALLOWED_ROLES = {
    "player",
    "trader",
    "store-owner",
    "organizer",
    "admin",
}
FEEDBACK_CATEGORY_OPTIONS = {"idea", "ux", "data", "bug", "other"}
FEEDBACK_RATE_LIMIT_POLICY = RateLimitPolicy(
    bucket="settings-feedback",
    limit=5,
    window_seconds=60 * 60,
)


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


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category: Annotated[str, StringConstraints(min_length=2, max_length=20)]
    subject: Annotated[str, StringConstraints(max_length=120)] = ""
    message: Annotated[str, StringConstraints(min_length=1, max_length=1200)]
    allow_contact: bool = True


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
    logger.info(
        "User settings updated",
        extra=build_log_extra(
            "settings_profile_updated",
            user_id=current_user.id,
            username=current_user.username,
            favorite_tgc_id=current_user.favorite_tgc_id,
            default_tgc_id=current_user.default_tgc_id,
            advanced_mode=bool(current_user.advanced_mode),
        ),
    )
    return _serialize_user(current_user)


@router.post("/password")
def update_password(
    payload: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not verify_password(payload.old_password, current_user.password_hash):
        logger.warning(
            "Password update rejected due to invalid current password",
            extra=build_log_extra(
                "settings_password_update_rejected",
                user_id=current_user.id,
                username=current_user.username,
            ),
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(payload.new_password or "") < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    current_user.password_hash = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    logger.info(
        "Password updated",
        extra=build_log_extra(
            "settings_password_updated",
            user_id=current_user.id,
            username=current_user.username,
        ),
    )
    return {"message": "Password updated"}


@router.post("/feedback")
def submit_feedback(
    payload: FeedbackRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    category = (payload.category or "").strip().lower()
    if category not in FEEDBACK_CATEGORY_OPTIONS:
        raise HTTPException(status_code=400, detail="Invalid feedback category")

    enforce_rate_limit(request, FEEDBACK_RATE_LIMIT_POLICY, key_fragment=current_user.username)

    submission = FeedbackSubmission(
        category=category,
        subject=(payload.subject or "").strip(),
        message=(payload.message or "").strip(),
        allow_contact=bool(payload.allow_contact),
        username=current_user.username,
        email=current_user.email or "",
        display_name=current_user.display_name or current_user.username,
        role=current_user.role or "player",
        user_id=current_user.id,
    )

    try:
        deliver_feedback_email(submission)
    except FeedbackConfigurationError as exc:
        logger.warning(
            "Feedback service is not configured",
            extra=build_log_extra(
                "feedback_delivery_unconfigured",
                username=current_user.username,
                user_id=current_user.id,
                feedback_category=category,
                error=str(exc),
            ),
        )
        raise HTTPException(status_code=503, detail="Feedback service is not configured") from exc
    except FeedbackDeliveryError as exc:
        logger.warning(
            "Feedback delivery returned an upstream failure",
            extra=build_log_extra(
                "feedback_delivery_upstream_failed",
                username=current_user.username,
                user_id=current_user.id,
                feedback_category=category,
                error=str(exc),
            ),
        )
        raise HTTPException(status_code=502, detail="No se pudo enviar la sugerencia") from exc

    logger.info(
        "Feedback submitted",
        extra=build_log_extra(
            "feedback_submitted",
            username=current_user.username,
            user_id=current_user.id,
            feedback_category=category,
            allow_contact=bool(payload.allow_contact),
        ),
    )
    return {"message": "Feedback sent"}


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
    logger.info(
        "User role updated",
        extra=build_log_extra(
            "admin_user_role_updated",
            actor_user_id=current_user.id,
            actor_username=current_user.username,
            target_user_id=user.id,
            target_username=user.username,
            target_role=user.role,
        ),
    )
    return _serialize_user(user)


@router.delete("/me")
def delete_my_account(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not verify_password(payload.password, current_user.password_hash):
        logger.warning(
            "Account deletion rejected due to invalid current password",
            extra=build_log_extra(
                "settings_account_delete_rejected",
                user_id=current_user.id,
                username=current_user.username,
            ),
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    owned_deck_ids = [
        deck_id
        for (deck_id,) in db.query(Deck.id).filter(Deck.user_id == current_user.id).all()
    ]

    if owned_deck_ids:
        db.execute(delete(DeckCard).where(DeckCard.deck_id.in_(owned_deck_ids)))
        db.execute(delete(DeckEggCard).where(DeckEggCard.deck_id.in_(owned_deck_ids)))
        db.execute(delete(DeckConsideringCard).where(DeckConsideringCard.deck_id.in_(owned_deck_ids)))
        db.execute(delete(Deck).where(Deck.id.in_(owned_deck_ids)))

    db.execute(delete(UserCollection).where(UserCollection.user_id == current_user.id))
    db.execute(delete(User).where(User.id == current_user.id))
    db.commit()
    logger.info(
        "Account deleted",
        extra=build_log_extra(
            "settings_account_deleted",
            user_id=current_user.id,
            username=current_user.username,
            owned_deck_count=len(owned_deck_ids),
        ),
    )
    return {"message": "Account deleted"}
