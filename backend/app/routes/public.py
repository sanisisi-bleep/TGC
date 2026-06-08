import os
import re
from html import escape
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.database.connection import get_db
from app.logger import build_log_extra, logger, mask_identifier
from app.models import Card, Tgc
from app.rate_limit import RateLimitPolicy, enforce_rate_limit
from app.services.feedback_service import (
    FEEDBACK_CATEGORY_OPTIONS,
    FeedbackAttachment,
    FeedbackAttachmentValidationError,
    FeedbackConfigurationError,
    FeedbackDeliveryError,
    FeedbackSubmission,
    deliver_feedback_email,
    validate_feedback_attachment,
)
from app.services.card_service import CardService
from app.services.game_rules import (
    DIGIMON_TCG_NAME,
    GUNDAM_TCG_NAME,
    MAGIC_TCG_NAME,
    ONE_PIECE_TCG_NAME,
    RIFTBOUND_TCG_NAME,
    canonicalize_tgc_name,
    get_tgc_name_aliases,
)

router = APIRouter(prefix="/public", tags=["public"])

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PUBLIC_CATALOG_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
SITEMAP_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
DEFAULT_PUBLIC_SITE_URL = "https://tgc-drab.vercel.app"
PUBLIC_TGC_SLUG_TO_NAME = {
    "gundam": GUNDAM_TCG_NAME,
    "one-piece": ONE_PIECE_TCG_NAME,
    "digimon": DIGIMON_TCG_NAME,
    "riftbound": RIFTBOUND_TCG_NAME,
    "magic": MAGIC_TCG_NAME,
}
PUBLIC_TGC_NAME_TO_SLUG = {
    canonicalize_tgc_name(name): slug
    for slug, name in PUBLIC_TGC_SLUG_TO_NAME.items()
}
PUBLIC_CONTACT_RATE_LIMIT_POLICY = RateLimitPolicy(
    bucket="public-contact",
    limit=4,
    window_seconds=60 * 60,
)


class PublicContactRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Annotated[str, StringConstraints(max_length=100)] = ""
    email: Annotated[str, StringConstraints(max_length=100)] = ""
    category: Annotated[str, StringConstraints(min_length=2, max_length=20)]
    subject: Annotated[str, StringConstraints(max_length=120)] = ""
    message: Annotated[str, StringConstraints(max_length=1200)] = ""
    allow_contact: bool = True

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized_email = (value or "").strip().lower()
        if normalized_email and not EMAIL_PATTERN.fullmatch(normalized_email):
            raise ValueError("Invalid email format")
        return normalized_email


def _parse_form_bool(value: str | bool | None, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _apply_cache_headers(response: Response, cache_control: str):
    response.headers["Cache-Control"] = cache_control


def _get_public_site_url() -> str:
    return (os.getenv("PUBLIC_SITE_URL") or DEFAULT_PUBLIC_SITE_URL).rstrip("/")


def _normalize_public_code(value: str | None) -> str:
    normalized = re.sub(r"\s+", " ", (value or "").strip())
    normalized = normalized.replace("_", "-")
    return normalized.upper()


def _normalize_public_code_sql(column):
    return func.upper(func.replace(func.trim(column), "_", "-"))


def _public_slug_for_tgc_name(name: str | None) -> str | None:
    return PUBLIC_TGC_NAME_TO_SLUG.get(canonicalize_tgc_name(name))


def _get_public_tgc(db: Session, tgc_slug: str) -> Tgc:
    canonical_name = PUBLIC_TGC_SLUG_TO_NAME.get((tgc_slug or "").strip().lower())
    if not canonical_name:
        raise HTTPException(status_code=404, detail="TCG not found")

    alias_names = {
        canonicalize_tgc_name(alias)
        for alias in get_tgc_name_aliases(canonical_name)
    }
    candidates = [
        tgc
        for tgc in db.query(Tgc).all()
        if canonicalize_tgc_name(tgc.name) in alias_names
    ]
    if not candidates:
        raise HTTPException(status_code=404, detail="TCG not found")

    card_counts = {
        tgc_id: quantity
        for tgc_id, quantity in (
            db.query(Card.tgc_id, func.count(Card.id))
            .filter(Card.tgc_id.in_([candidate.id for candidate in candidates]))
            .group_by(Card.tgc_id)
            .all()
        )
    }

    return max(
        candidates,
        key=lambda item: (
            int(card_counts.get(item.id, 0) > 0),
            card_counts.get(item.id, 0),
            int(canonicalize_tgc_name(item.name) == canonical_name),
            -item.id,
        ),
    )


def _card_public_path(tgc_slug: str, source_card_id: str | None) -> str:
    return f"/cards/{quote(tgc_slug)}/{quote((source_card_id or '').strip(), safe='')}"


def _set_public_path(tgc_slug: str, set_code: str | None) -> str:
    return f"/sets/{quote(tgc_slug)}/{quote((set_code or '').strip(), safe='')}"


def _build_sitemap_url(path: str, priority: str = "0.6", changefreq: str = "weekly") -> str:
    site_url = _get_public_site_url()
    return (
        "  <url>"
        f"<loc>{escape(site_url + path)}</loc>"
        f"<changefreq>{changefreq}</changefreq>"
        f"<priority>{priority}</priority>"
        "</url>"
    )


def _serialize_tgc(tgc: Tgc, slug: str):
    return {
        "id": tgc.id,
        "slug": slug,
        "name": tgc.name,
        "description": tgc.description,
    }


async def _build_feedback_attachment(upload: UploadFile | None) -> FeedbackAttachment | None:
    if upload is None or not (upload.filename or "").strip():
        return None

    payload = await upload.read()
    try:
        return validate_feedback_attachment(upload.filename, upload.content_type, payload)
    except FeedbackAttachmentValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/contact")
async def submit_public_contact(
    request: Request,
    name: str = Form(""),
    email: str = Form(""),
    category: str = Form(...),
    subject: str = Form(""),
    message: str = Form(""),
    allow_contact: str = Form("true"),
    attachment: UploadFile | None = File(None),
):
    try:
        payload = PublicContactRequest(
            name=name,
            email=email,
            category=category,
            subject=subject,
            message=message,
            allow_contact=_parse_form_bool(allow_contact),
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    normalized_category = (payload.category or "").strip().lower()
    if normalized_category not in FEEDBACK_CATEGORY_OPTIONS:
        raise HTTPException(status_code=400, detail="Invalid feedback category")

    if payload.allow_contact and not (payload.email or "").strip():
        raise HTTPException(status_code=400, detail="El email es obligatorio si quieres que podamos responderte.")

    enforce_rate_limit(request, PUBLIC_CONTACT_RATE_LIMIT_POLICY)
    feedback_attachment = await _build_feedback_attachment(attachment)

    if not (payload.message or "").strip() and feedback_attachment is None:
        raise HTTPException(status_code=400, detail="Escribe un mensaje o adjunta un archivo multimedia.")

    submission = FeedbackSubmission(
        category=normalized_category,
        subject=(payload.subject or "").strip(),
        message=(payload.message or "").strip(),
        allow_contact=bool(payload.allow_contact),
        email=(payload.email or "").strip().lower(),
        display_name=(payload.name or "").strip(),
        source_label="public-contact",
        attachment=feedback_attachment,
    )

    try:
        deliver_feedback_email(submission)
    except FeedbackConfigurationError as exc:
        logger.warning(
            "Public contact service is not configured",
            extra=build_log_extra(
                "public_contact_unconfigured",
                feedback_category=normalized_category,
                email=mask_identifier(payload.email),
                has_attachment=bool(feedback_attachment),
                error=str(exc),
            ),
        )
        raise HTTPException(status_code=503, detail="Feedback service is not configured") from exc
    except FeedbackDeliveryError as exc:
        logger.warning(
            "Public contact delivery failed upstream",
            extra=build_log_extra(
                "public_contact_delivery_failed",
                feedback_category=normalized_category,
                email=mask_identifier(payload.email),
                has_attachment=bool(feedback_attachment),
                error=str(exc),
            ),
        )
        raise HTTPException(status_code=502, detail="No se pudo enviar el mensaje") from exc

    logger.info(
        "Public contact submitted",
        extra=build_log_extra(
            "public_contact_submitted",
            feedback_category=normalized_category,
            email=mask_identifier(payload.email),
            allow_contact=bool(payload.allow_contact),
            has_attachment=bool(feedback_attachment),
            attachment_filename=feedback_attachment.filename if feedback_attachment else None,
        ),
    )
    return {"message": "Contact message sent"}


@router.get("/cards/{tgc_slug}/{source_card_id}")
def get_public_card(
    tgc_slug: str,
    source_card_id: str,
    response: Response,
    db: Session = Depends(get_db),
):
    _apply_cache_headers(response, PUBLIC_CATALOG_CACHE_CONTROL)
    tgc = _get_public_tgc(db, tgc_slug)
    normalized_code = _normalize_public_code(source_card_id)
    if not normalized_code:
        raise HTTPException(status_code=404, detail="Card not found")

    card = (
        db.query(Card)
        .options(
            joinedload(Card.digimon_data),
            joinedload(Card.one_piece_data),
            joinedload(Card.gundam_data),
            joinedload(Card.riftbound_data),
        )
        .filter(
            Card.tgc_id == tgc.id,
            or_(
                _normalize_public_code_sql(Card.source_card_id) == normalized_code,
                _normalize_public_code_sql(Card.deck_key) == normalized_code,
            ),
        )
        .order_by(Card.id.asc())
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    service = CardService(db)
    canonical_slug = _public_slug_for_tgc_name(tgc.name) or tgc_slug
    payload = service.serialize_card(card)
    return {
        "tgc": _serialize_tgc(tgc, canonical_slug),
        "card": payload,
        "canonical_path": _card_public_path(canonical_slug, payload.get("source_card_id") or source_card_id),
        "set_path": _set_public_path(canonical_slug, payload.get("set_name") or payload.get("version") or ""),
    }


@router.get("/sets/{tgc_slug}/{set_code}")
def get_public_set(
    tgc_slug: str,
    set_code: str,
    response: Response,
    limit: int = Query(300, ge=1, le=500),
    db: Session = Depends(get_db),
):
    _apply_cache_headers(response, PUBLIC_CATALOG_CACHE_CONTROL)
    tgc = _get_public_tgc(db, tgc_slug)
    normalized_set_code = (set_code or "").strip()
    if not normalized_set_code:
        raise HTTPException(status_code=404, detail="Set not found")

    service = CardService(db)
    page = service.get_cards_page(
        tgc_id=tgc.id,
        set_name=normalized_set_code,
        sort="collection-asc",
        page=1,
        limit=limit,
    )
    if page["total"] <= 0:
        raise HTTPException(status_code=404, detail="Set not found")

    canonical_slug = _public_slug_for_tgc_name(tgc.name) or tgc_slug
    display_set_name = normalized_set_code
    if page["items"]:
        first_card = page["items"][0]
        display_set_name = first_card.get("set_name") or first_card.get("version") or normalized_set_code

    type_counts = {}
    color_counts = {}
    rarity_counts = {}
    for card in page["items"]:
        for counts, key in (
            (type_counts, "card_type"),
            (color_counts, "color"),
            (rarity_counts, "rarity"),
        ):
            value = card.get(key) or "Sin dato"
            counts[value] = counts.get(value, 0) + 1

    return {
        "tgc": _serialize_tgc(tgc, canonical_slug),
        "set": {
            "code": normalized_set_code,
            "name": display_set_name,
            "card_count": page["total"],
            "shown_count": len(page["items"]),
        },
        "cards": page["items"],
        "facets": {
            "card_types": type_counts,
            "colors": color_counts,
            "rarities": rarity_counts,
        },
        "canonical_path": _set_public_path(canonical_slug, display_set_name),
    }


@router.get("/sitemap.xml")
def get_public_sitemap(response: Response, db: Session = Depends(get_db)):
    _apply_cache_headers(response, SITEMAP_CACHE_CONTROL)
    static_urls = [
        _build_sitemap_url("/", "1.0", "weekly"),
        _build_sitemap_url("/search", "0.8", "weekly"),
        _build_sitemap_url("/updates", "0.7", "weekly"),
        _build_sitemap_url("/guides", "0.7", "weekly"),
        _build_sitemap_url("/contact", "0.4", "monthly"),
        _build_sitemap_url("/about", "0.5", "monthly"),
    ]

    tgc_rows = db.query(Tgc.id, Tgc.name).all()
    slug_by_tgc_id = {
        tgc_id: _public_slug_for_tgc_name(tgc_name)
        for tgc_id, tgc_name in tgc_rows
    }
    valid_tgc_ids = [tgc_id for tgc_id, slug in slug_by_tgc_id.items() if slug]

    set_urls = []
    if valid_tgc_ids:
        set_rows = (
            db.query(Card.tgc_id, Card.set_name, Card.version)
            .filter(
                Card.tgc_id.in_(valid_tgc_ids),
                Card.set_name.isnot(None),
                Card.set_name != "",
            )
            .distinct()
            .all()
        )
        seen_sets = set()
        for tgc_id, set_name, version in set_rows:
            slug = slug_by_tgc_id.get(tgc_id)
            set_key = (set_name or version or "").strip()
            if not slug or not set_key:
                continue
            dedupe_key = (slug, set_key.lower())
            if dedupe_key in seen_sets:
                continue
            seen_sets.add(dedupe_key)
            set_urls.append(_build_sitemap_url(_set_public_path(slug, set_key), "0.6", "weekly"))

    card_urls = []
    if valid_tgc_ids:
        card_rows = (
            db.query(Card.tgc_id, Card.source_card_id)
            .filter(
                Card.tgc_id.in_(valid_tgc_ids),
                Card.source_card_id.isnot(None),
                Card.source_card_id != "",
            )
            .all()
        )
        seen_cards = set()
        for tgc_id, source_card_id in card_rows:
            slug = slug_by_tgc_id.get(tgc_id)
            source_key = (source_card_id or "").strip()
            if not slug or not source_key:
                continue
            dedupe_key = (slug, source_key.lower())
            if dedupe_key in seen_cards:
                continue
            seen_cards.add(dedupe_key)
            card_urls.append(_build_sitemap_url(_card_public_path(slug, source_key), "0.5", "monthly"))

    guide_urls = [
        _build_sitemap_url("/guides/importar-mazos-digimon", "0.6", "monthly"),
        _build_sitemap_url("/guides/organizar-mazos-carpetas", "0.6", "monthly"),
        _build_sitemap_url("/guides/completar-mazo-con-coleccion", "0.6", "monthly"),
        _build_sitemap_url("/guides/one-piece-don", "0.6", "monthly"),
    ]

    xml = "\n".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        *static_urls,
        *guide_urls,
        *set_urls,
        *card_urls,
        '</urlset>',
    ])
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Cache-Control": SITEMAP_CACHE_CONTROL},
    )


@router.head("/sitemap.xml")
def head_public_sitemap():
    return Response(
        status_code=200,
        media_type="application/xml",
        headers={"Cache-Control": SITEMAP_CACHE_CONTROL},
    )
