from sqlalchemy import func

from app.models import Card, Tgc
from app.database.repositories.tgc_repository import TgcRepository
from sqlalchemy.orm import Session
from app.services.game_rules import (
    canonicalize_tgc_name,
    DIGIMON_TCG_NAME,
    GUNDAM_TCG_NAME,
    MAGIC_TCG_NAME,
    ONE_PIECE_TCG_NAME,
    RIFTBOUND_TCG_NAME,
    get_tgc_name_aliases,
)


DEFAULT_TGCS = [
    {"name": GUNDAM_TCG_NAME, "description": "Gundam Card Game"},
    {"name": ONE_PIECE_TCG_NAME, "description": "One Piece Card Game"},
    {"name": DIGIMON_TCG_NAME, "description": "Digimon Card Game"},
    {"name": MAGIC_TCG_NAME, "description": "Magic: The Gathering"},
    {"name": RIFTBOUND_TCG_NAME, "description": "Riftbound"},
]

class TgcService:
    def __init__(self, db: Session):
        self.db = db
        self.tgc_repo = TgcRepository(db)

    def get_all_tgc(self):
        self.ensure_default_tgcs()
        return self._serialize_catalog_entries()

    def create_tgc(self, name: str, description: str = None) -> Tgc:
        existing = self._find_best_matching_tgc(name)
        if existing:
            return existing

        canonical_name = canonicalize_tgc_name(name) or (name or "").strip()
        tgc = Tgc(name=canonical_name, description=description)
        return self.tgc_repo.create(tgc)

    def ensure_default_tgcs(self):
        for item in DEFAULT_TGCS:
            existing = self._find_best_matching_tgc(item["name"])
            if not existing:
                self.tgc_repo.create(Tgc(name=item["name"], description=item["description"]))
                continue

            if existing.name != item["name"] and not self._has_canonical_duplicate(item["name"], existing.id):
                existing.name = item["name"]

            if item["description"] and existing.description != item["description"]:
                existing.description = item["description"]

        self.db.commit()

    def get_by_name(self, name: str):
        self.ensure_default_tgcs()
        return self._find_best_matching_tgc(name)

    def _get_card_counts_by_tgc_id(self):
        rows = (
            self.db.query(Card.tgc_id, func.count(Card.id))
            .group_by(Card.tgc_id)
            .all()
        )
        return {tgc_id: count for tgc_id, count in rows if tgc_id is not None}

    def _find_matching_tgcs(self, name: str):
        alias_names = {alias.lower() for alias in get_tgc_name_aliases(name)}
        if not alias_names:
            return []

        return [
            tgc for tgc in self.tgc_repo.get_all()
            if (tgc.name or "").strip().lower() in alias_names
        ]

    def _find_best_matching_tgc(self, name: str):
        candidates = self._find_matching_tgcs(name)
        if not candidates:
            return None

        canonical_name = canonicalize_tgc_name(name)
        card_counts = self._get_card_counts_by_tgc_id()
        return max(
            candidates,
            key=lambda tgc: (
                int(card_counts.get(tgc.id, 0) > 0),
                card_counts.get(tgc.id, 0),
                int((tgc.name or "").strip() == canonical_name),
                -tgc.id,
            ),
        )

    def _has_canonical_duplicate(self, name: str, excluded_id: int):
        canonical_name = canonicalize_tgc_name(name)
        for tgc in self._find_matching_tgcs(name):
            if tgc.id != excluded_id and (tgc.name or "").strip() == canonical_name:
                return True
        return False

    def _serialize_catalog_entries(self):
        card_counts = self._get_card_counts_by_tgc_id()
        entries_by_canonical = {}

        for item in DEFAULT_TGCS:
            match = self._find_best_matching_tgc(item["name"])
            if not match:
                continue
            entries_by_canonical[canonicalize_tgc_name(item["name"])] = {
                "id": match.id,
                "name": item["name"],
                "description": item["description"],
                "card_count": card_counts.get(match.id, 0),
            }

        for tgc in self.tgc_repo.get_all():
            canonical_name = canonicalize_tgc_name(tgc.name)
            if not canonical_name:
                continue
            if canonical_name in entries_by_canonical:
                continue
            entries_by_canonical[canonical_name] = {
                "id": tgc.id,
                "name": tgc.name,
                "description": tgc.description,
                "card_count": card_counts.get(tgc.id, 0),
            }

        return list(entries_by_canonical.values())
