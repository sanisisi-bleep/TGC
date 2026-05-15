from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    Text,
    TIMESTAMP,
    UniqueConstraint,
    func,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class Tgc(Base):
    __tablename__ = "tgc"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True)
    description = Column(Text)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True)
    password_hash = Column(String(255))
    role = Column(String(30), default="player")
    display_name = Column(String(100))
    bio = Column(Text)
    advanced_mode = Column(Boolean, default=False)
    favorite_tgc_id = Column(Integer, ForeignKey("tgc.id"))
    default_tgc_id = Column(Integer, ForeignKey("tgc.id"))

    favorite_tgc = relationship("Tgc", foreign_keys=[favorite_tgc_id])
    default_tgc = relationship("Tgc", foreign_keys=[default_tgc_id])


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    tgc_id = Column(Integer, ForeignKey("tgc.id"))
    source_card_id = Column(String(50), index=True)
    deck_key = Column(String(50), index=True)
    name = Column(String(255))
    card_type = Column(String(50))
    lv = Column(Integer)
    cost = Column(Integer)
    ap = Column(Integer)
    hp = Column(Integer)
    color = Column(String(100))
    rarity = Column(String(20))
    set_name = Column(String(255))
    version = Column(String(50))
    block = Column(Integer)
    traits = Column(Text)
    link = Column(Text)
    zones = Column(Text)
    artist = Column(String(255))
    abilities = Column(Text)
    description = Column(Text)
    image_url = Column(Text)

    tgc = relationship("Tgc")
    gundam_data = relationship("GundamCard", back_populates="card", uselist=False)
    one_piece_data = relationship("OnePieceCard", back_populates="card", uselist=False)
    magic_data = relationship("MagicCard", back_populates="card", uselist=False)
    digimon_data = relationship("DigimonCard", back_populates="card", uselist=False)
    riftbound_data = relationship("RiftboundCard", back_populates="card", uselist=False)


class GundamCard(Base):
    __tablename__ = "gundam_cards"

    card_id = Column(Integer, ForeignKey("cards.id"), primary_key=True)
    level = Column(Integer)
    ap = Column(Integer)
    hp = Column(Integer)
    block = Column(Integer)
    zone = Column(Text)
    trait = Column(Text)
    link = Column(Text)
    effect = Column(Text)
    source_title = Column(Text)
    get_it = Column(Text)
    artist = Column(String(255))
    qa = Column(Text)

    card = relationship("Card", back_populates="gundam_data")


class OnePieceCard(Base):
    __tablename__ = "one_piece_cards"

    card_id = Column(Integer, ForeignKey("cards.id"), primary_key=True)
    attribute_name = Column(String(100))
    attribute_image = Column(String(255))
    power = Column(Integer)
    family = Column(Text)
    ability = Column(Text)
    counter = Column(String(20))
    trigger = Column(Text)
    notes = Column(Text)
    qa = Column(Text)

    card = relationship("Card", back_populates="one_piece_data")


class MagicCard(Base):
    __tablename__ = "magic_cards"

    card_id = Column(Integer, ForeignKey("cards.id"), primary_key=True)
    colors = Column(Text)
    set_name = Column(String(255))
    power = Column(String(20))
    toughness = Column(String(20))
    mana_cost = Column(String(100))
    cmc = Column(Integer)
    color_identity = Column(Text)
    text = Column(Text)
    type_line = Column(Text)
    typal = Column(Text)
    keywords = Column(Text)
    image_url = Column(Text)

    card = relationship("Card", back_populates="magic_data")


class DigimonCard(Base):
    __tablename__ = "digimon_cards"

    card_id = Column(Integer, ForeignKey("cards.id"), primary_key=True)
    dp = Column(Integer)
    form = Column(String(100))
    attribute = Column(String(100))
    type_line = Column(Text)
    digivolution_requirements = Column(Text)
    special_digivolution = Column(Text)
    inherited_effect = Column(Text)
    security_effect = Column(Text)
    rule_text = Column(Text)
    notes = Column(Text)
    qa = Column(Text)
    is_alternative_art = Column(Boolean, default=False)

    card = relationship("Card", back_populates="digimon_data")


class RiftboundCard(Base):
    __tablename__ = "riftbound_cards"

    card_id = Column(Integer, ForeignKey("cards.id"), primary_key=True)
    domains = Column(Text)
    energy_cost = Column(Integer)
    power_cost = Column(Integer)
    might = Column(Integer)
    tags = Column(Text)
    keywords = Column(Text)
    champion_tag = Column(String(100))
    is_signature = Column(Boolean, default=False)
    is_rune = Column(Boolean, default=False)
    is_battlefield = Column(Boolean, default=False)
    is_legend = Column(Boolean, default=False)
    is_champion = Column(Boolean, default=False)
    collector_number = Column(Integer)
    variant_code = Column(String(50))
    set_code = Column(String(50))
    legality_status = Column(String(50))
    has_errata = Column(Boolean, default=False)
    errata_source_url = Column(Text)
    updated_text = Column(Text)

    card = relationship("Card", back_populates="riftbound_data")


class UserCollection(Base):
    __tablename__ = "user_collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    card_id = Column(Integer, ForeignKey("cards.id"))
    quantity = Column(Integer, default=1)

    user = relationship("User")
    card = relationship("Card")


class Deck(Base):
    __tablename__ = "decks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    tgc_id = Column(Integer, ForeignKey("tgc.id"))
    riftbound_chosen_champion_card_id = Column(Integer)
    name = Column(String(100))
    share_token = Column(String(64), unique=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User")
    tgc = relationship("Tgc")


class DeckCard(Base):
    __tablename__ = "deck_cards"

    id = Column(Integer, primary_key=True, index=True)
    deck_id = Column(Integer, ForeignKey("decks.id"))
    card_id = Column(Integer, ForeignKey("cards.id"))
    quantity = Column(Integer, default=1)
    assigned_quantity = Column(Integer)

    deck = relationship("Deck")
    card = relationship("Card")


class DeckConsideringCard(Base):
    __tablename__ = "deck_considering_cards"

    id = Column(Integer, primary_key=True, index=True)
    deck_id = Column(Integer, ForeignKey("decks.id"))
    card_id = Column(Integer, ForeignKey("cards.id"))
    quantity = Column(Integer, default=1)

    deck = relationship("Deck")
    card = relationship("Card")


class DeckEggCard(Base):
    __tablename__ = "deck_egg_cards"

    id = Column(Integer, primary_key=True, index=True)
    deck_id = Column(Integer, ForeignKey("decks.id"))
    card_id = Column(Integer, ForeignKey("cards.id"))
    quantity = Column(Integer, default=1)
    assigned_quantity = Column(Integer)

    deck = relationship("Deck")
    card = relationship("Card")


class DeckZoneCard(Base):
    __tablename__ = "deck_zone_cards"
    __table_args__ = (
        UniqueConstraint("deck_id", "card_id", "zone", name="uq_deck_zone_cards_deck_card_zone"),
    )

    id = Column(Integer, primary_key=True, index=True)
    deck_id = Column(Integer, ForeignKey("decks.id"))
    card_id = Column(Integer, ForeignKey("cards.id"))
    zone = Column(String(30), nullable=False)
    quantity = Column(Integer, default=1)
    assigned_quantity = Column(Integer)

    deck = relationship("Deck")
    card = relationship("Card")


class DeckVersion(Base):
    __tablename__ = "deck_versions"
    __table_args__ = (
        UniqueConstraint("deck_id", "version_number", name="uq_deck_versions_deck_version_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    deck_id = Column(Integer, ForeignKey("decks.id"))
    version_number = Column(Integer, nullable=False)
    source = Column(String(40), nullable=False)
    label = Column(String(100))
    snapshot_data = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    deck = relationship("Deck")


class RateLimitCounter(Base):
    __tablename__ = "rate_limit_counters"
    __table_args__ = (
        UniqueConstraint(
            "bucket",
            "rate_key",
            "window_seconds",
            "window_started_at",
            name="uq_rate_limit_counter_window",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    bucket = Column(String(100), nullable=False, index=True)
    rate_key = Column(String(255), nullable=False)
    window_seconds = Column(Integer, nullable=False)
    window_started_at = Column(Integer, nullable=False)
    hits = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)


__all__ = [
    "Base",
    "Tgc",
    "User",
    "Card",
    "GundamCard",
    "OnePieceCard",
    "MagicCard",
    "DigimonCard",
    "RiftboundCard",
    "UserCollection",
    "Deck",
    "DeckCard",
    "DeckConsideringCard",
    "DeckEggCard",
    "DeckZoneCard",
    "DeckVersion",
    "RateLimitCounter",
]
