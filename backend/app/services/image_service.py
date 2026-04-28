from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import re


def _build_weserv_url(source_url: str) -> str:
    return urlunsplit(
        (
            "https",
            "images.weserv.nl",
            "/",
            urlencode({"url": source_url}),
            "",
        )
    )


def _normalize_gundam_image_code(source_card_id: str | None) -> str:
    normalized = (source_card_id or "").strip().upper().replace("_", "-")
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized)
    normalized = re.sub(r"-P(\d+)$", lambda match: f"_p{match.group(1)}", normalized, flags=re.IGNORECASE)
    return normalized


def build_gundam_card_image_url(source_card_id: str | None) -> str | None:
    image_code = _normalize_gundam_image_code(source_card_id)
    if not image_code:
        return None

    return _build_weserv_url(f"www.gundam-gcg.com/en/images/cards/card/{image_code}.webp")


def resolve_card_image_url(
    image_url: str | None,
    source_card_id: str | None = None,
    tgc_name: str | None = None,
) -> str | None:
    normalized_image_url = normalize_card_image_url(image_url)
    if normalized_image_url:
        return normalized_image_url

    if tgc_name == "Gundam TGC":
        return build_gundam_card_image_url(source_card_id)

    return normalized_image_url


def normalize_card_image_url(image_url: str | None) -> str | None:
    if not image_url:
        return image_url

    normalized = image_url.strip()
    if "images.weserv.nl/" in normalized:
        return normalized

    if (
        "en.onepiece-cardgame.com/images/cardlist/card/" in normalized
        or "www.gundam-gcg.com/" in normalized
        or "gundam-gcg.com/" in normalized
    ):
        if normalized.startswith("https://"):
            normalized = normalized[len("https://"):]
        elif normalized.startswith("http://"):
            normalized = normalized[len("http://"):]
        return _build_weserv_url(normalized)

    return normalized


def build_card_thumbnail_url(image_url: str | None, width: int = 360) -> str | None:
    normalized = normalize_card_image_url(image_url)
    if not normalized or "images.weserv.nl/" not in normalized:
        return normalized

    parsed = urlsplit(normalized)
    query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))

    query_params.setdefault("w", str(width))
    query_params.setdefault("fit", "inside")

    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(query_params, doseq=True),
            parsed.fragment,
        )
    )
