import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path

from app.logger import build_log_extra, logger


DEFAULT_FEEDBACK_TO_EMAIL = "multiversetgc@gmail.com"
FEEDBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024


class FeedbackDeliveryError(Exception):
    pass


class FeedbackConfigurationError(FeedbackDeliveryError):
    pass


class FeedbackAttachmentValidationError(ValueError):
    pass


@dataclass(frozen=True)
class FeedbackAttachment:
    filename: str
    content_type: str
    data: bytes


@dataclass(frozen=True)
class FeedbackSubmission:
    category: str
    subject: str
    message: str
    allow_contact: bool
    username: str
    email: str
    display_name: str
    role: str
    user_id: int
    attachment: FeedbackAttachment | None = None


def _is_jpeg(data: bytes) -> bool:
    return data.startswith(b"\xFF\xD8\xFF")


def _is_png(data: bytes) -> bool:
    return data.startswith(b"\x89PNG\r\n\x1a\n")


def _is_gif(data: bytes) -> bool:
    return data.startswith((b"GIF87a", b"GIF89a"))


def _is_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def _is_bmp(data: bytes) -> bool:
    return data.startswith(b"BM")


def _is_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def _is_ogg(data: bytes) -> bool:
    return data.startswith(b"OggS")


def _is_flac(data: bytes) -> bool:
    return data.startswith(b"fLaC")


def _is_mp3(data: bytes) -> bool:
    if data.startswith(b"ID3"):
        return True
    return len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0


def _is_ebml_webm(data: bytes) -> bool:
    return data.startswith(b"\x1A\x45\xDF\xA3") and b"webm" in data[:256].lower()


def _detect_iso_base_media_type(data: bytes, claimed_content_type: str) -> str | None:
    if len(data) < 12 or data[4:8] != b"ftyp":
        return None

    brand = data[8:12]
    if brand in {b"M4A ", b"M4B ", b"M4P "}:
        return "audio/mp4"
    if brand == b"qt  ":
        return "video/quicktime"
    if claimed_content_type == "audio/mp4":
        return "audio/mp4"
    return "video/mp4"


def _detect_supported_feedback_media_type(data: bytes, claimed_content_type: str | None) -> str | None:
    normalized_claim = (claimed_content_type or "").strip().lower()

    if _is_png(data):
        return "image/png"
    if _is_jpeg(data):
        return "image/jpeg"
    if _is_gif(data):
        return "image/gif"
    if _is_webp(data):
        return "image/webp"
    if _is_bmp(data):
        return "image/bmp"
    if _is_wav(data):
        return "audio/wav"
    if _is_flac(data):
        return "audio/flac"
    if _is_mp3(data):
        return "audio/mpeg"
    if _is_ogg(data):
        if normalized_claim.startswith("video/"):
            return "video/ogg"
        return "audio/ogg"
    if _is_ebml_webm(data):
        if normalized_claim == "audio/webm":
            return "audio/webm"
        return "video/webm"

    return _detect_iso_base_media_type(data, normalized_claim)


def validate_feedback_attachment(
    filename: str | None,
    claimed_content_type: str | None,
    payload: bytes,
) -> FeedbackAttachment:
    if not payload:
        raise FeedbackAttachmentValidationError("El archivo adjunto esta vacio.")

    if len(payload) > FEEDBACK_ATTACHMENT_MAX_BYTES:
        raise FeedbackAttachmentValidationError("El adjunto supera el limite de 5 MB.")

    detected_content_type = _detect_supported_feedback_media_type(payload, claimed_content_type)
    if detected_content_type is None:
        raise FeedbackAttachmentValidationError(
            "Solo se permiten archivos multimedia reales de imagen, video o audio compatibles."
        )

    safe_name = Path(filename or "adjunto").name[:255] or "adjunto"
    return FeedbackAttachment(
        filename=safe_name,
        content_type=detected_content_type,
        data=payload,
    )


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_feedback_config():
    smtp_host = (os.getenv("FEEDBACK_SMTP_HOST") or "smtp.gmail.com").strip()
    smtp_port = int((os.getenv("FEEDBACK_SMTP_PORT") or "587").strip())
    smtp_username = (os.getenv("FEEDBACK_SMTP_USERNAME") or DEFAULT_FEEDBACK_TO_EMAIL).strip()
    smtp_password = (os.getenv("FEEDBACK_SMTP_PASSWORD") or "").strip()
    smtp_timeout_seconds = int((os.getenv("FEEDBACK_SMTP_TIMEOUT_SECONDS") or "20").strip())
    smtp_use_starttls = _env_flag("FEEDBACK_SMTP_USE_STARTTLS", default=True)
    feedback_to_email = (os.getenv("FEEDBACK_TO_EMAIL") or DEFAULT_FEEDBACK_TO_EMAIL).strip()
    feedback_from_email = (
        os.getenv("FEEDBACK_FROM_EMAIL")
        or smtp_username
        or DEFAULT_FEEDBACK_TO_EMAIL
    ).strip()

    if not smtp_username or not smtp_password:
        raise FeedbackConfigurationError(
            "Feedback email service is not configured. Set FEEDBACK_SMTP_USERNAME and FEEDBACK_SMTP_PASSWORD."
        )

    return {
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_username": smtp_username,
        "smtp_password": smtp_password,
        "smtp_timeout_seconds": smtp_timeout_seconds,
        "smtp_use_starttls": smtp_use_starttls,
        "feedback_to_email": feedback_to_email,
        "feedback_from_email": feedback_from_email,
    }


def _build_feedback_message(submission: FeedbackSubmission, config: dict):
    normalized_subject = submission.subject.strip() or "Sin asunto"
    normalized_category = submission.category.strip() or "general"
    message = EmailMessage()
    message["Subject"] = f"[Multiverse TCG Feedback][{normalized_category.upper()}] {normalized_subject}"
    message["From"] = config["feedback_from_email"]
    message["To"] = config["feedback_to_email"]

    if submission.allow_contact and submission.email:
        message["Reply-To"] = submission.email

    author_name = submission.display_name or submission.username
    contact_line = (
        f"{author_name} <{submission.email}>"
        if submission.allow_contact and submission.email
        else "No compartir datos personales"
    )
    body_lines = [
        "Buzon de sugerencias - Multiverse TCG Manager",
        "",
        f"Categoria: {normalized_category}",
        f"Asunto: {normalized_subject}",
        f"Usuario: {submission.username}",
        f"Nombre visible: {author_name}",
        f"Rol: {submission.role}",
        f"User ID: {submission.user_id}",
        f"Contacto permitido: {'si' if submission.allow_contact else 'no'}",
        f"Contacto: {contact_line}",
        (
            f"Adjunto: {submission.attachment.filename} "
            f"({submission.attachment.content_type}, {len(submission.attachment.data)} bytes)"
            if submission.attachment
            else "Adjunto: ninguno"
        ),
        "",
        "Mensaje:",
        submission.message.strip() or "Sin detalles.",
    ]
    message.set_content("\n".join(body_lines))

    if submission.attachment:
        safe_name = Path(submission.attachment.filename or "adjunto").name[:255] or "adjunto"
        content_type = (submission.attachment.content_type or "application/octet-stream").strip().lower()
        maintype, _, subtype = content_type.partition("/")
        if not maintype or not subtype:
            maintype, subtype = "application", "octet-stream"
        message.add_attachment(
            submission.attachment.data,
            maintype=maintype,
            subtype=subtype,
            filename=safe_name,
        )

    return message


def deliver_feedback_email(submission: FeedbackSubmission):
    config = _resolve_feedback_config()
    message = _build_feedback_message(submission, config)

    try:
        with smtplib.SMTP(
            host=config["smtp_host"],
            port=config["smtp_port"],
            timeout=config["smtp_timeout_seconds"],
        ) as smtp:
            smtp.ehlo()
            if config["smtp_use_starttls"]:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(config["smtp_username"], config["smtp_password"])
            smtp.send_message(message)
    except FeedbackConfigurationError:
        raise
    except Exception as exc:
        logger.exception(
            "Feedback delivery failed",
            extra=build_log_extra(
                "feedback_delivery_failed",
                username=submission.username,
                user_id=submission.user_id,
                feedback_category=submission.category,
                feedback_subject=submission.subject.strip() or "Sin asunto",
                has_attachment=bool(submission.attachment),
                attachment_filename=submission.attachment.filename if submission.attachment else None,
                error=str(exc),
            ),
        )
        raise FeedbackDeliveryError("Feedback email could not be delivered.") from exc

    logger.info(
        "Feedback delivered successfully",
        extra=build_log_extra(
            "feedback_delivery_success",
            username=submission.username,
            user_id=submission.user_id,
            feedback_category=submission.category,
            feedback_subject=submission.subject.strip() or "Sin asunto",
            feedback_to_email=config["feedback_to_email"],
            has_attachment=bool(submission.attachment),
            attachment_filename=submission.attachment.filename if submission.attachment else None,
        ),
    )
