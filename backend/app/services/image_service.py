from urllib.parse import quote


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
