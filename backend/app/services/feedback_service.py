import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.logger import build_log_extra, logger


DEFAULT_FEEDBACK_TO_EMAIL = "multiversetgc@gmail.com"


class FeedbackDeliveryError(Exception):
    pass


class FeedbackConfigurationError(FeedbackDeliveryError):
    pass


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
        "",
        "Mensaje:",
        submission.message.strip() or "Sin detalles.",
    ]
    message.set_content("\n".join(body_lines))
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
        ),
    )
