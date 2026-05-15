import re
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError, field_validator

from app.logger import build_log_extra, logger, mask_identifier
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

router = APIRouter(prefix="/public", tags=["public"])

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
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
