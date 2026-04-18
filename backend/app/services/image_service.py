from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit


def normalize_card_image_url(image_url: str | None) -> str | None:
    if not image_url:
        return image_url

    normalized = image_url.strip()
    if "images.weserv.nl/" in normalized:
        return normalized

    if "en.onepiece-cardgame.com/images/cardlist/card/" in normalized:
        if normalized.startswith("https://"):
            normalized = normalized[len("https://"):]
        elif normalized.startswith("http://"):
            normalized = normalized[len("http://"):]
        return f"https://images.weserv.nl/?url={quote(normalized, safe='/:?=&.-_%')}"

    return image_url


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
