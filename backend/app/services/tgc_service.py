from app.models import Tgc
from app.database.repositories.tgc_repository import TgcRepository
from sqlalchemy.orm import Session
from app.services.game_rules import DIGIMON_TCG_NAME, GUNDAM_TGC_NAME, ONE_PIECE_TCG_NAME, MAGIC_TCG_NAME


DEFAULT_TGCS = [
    {"name": GUNDAM_TGC_NAME, "description": "Gundam Card Game"},
    {"name": ONE_PIECE_TCG_NAME, "description": "One Piece Card Game"},
    {"name": DIGIMON_TCG_NAME, "description": "Digimon Card Game"},
    {"name": MAGIC_TCG_NAME, "description": "Magic: The Gathering"},
]

class TgcService:
    def __init__(self, db: Session):
        self.db = db
        self.tgc_repo = TgcRepository(db)

    def get_all_tgc(self):
        self.ensure_default_tgcs()
        return self.tgc_repo.get_all()

    def create_tgc(self, name: str, description: str = None) -> Tgc:
        tgc = Tgc(name=name, description=description)
        return self.tgc_repo.create(tgc)

    def ensure_default_tgcs(self):
        existing = {tgc.name: tgc for tgc in self.tgc_repo.get_all()}

        for item in DEFAULT_TGCS:
            if item["name"] not in existing:
                self.tgc_repo.create(Tgc(name=item["name"], description=item["description"]))

    def get_by_name(self, name: str):
        self.ensure_default_tgcs()
        return self.db.query(Tgc).filter(Tgc.name == name).first()
