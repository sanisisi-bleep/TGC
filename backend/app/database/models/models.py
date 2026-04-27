from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, TIMESTAMP, func
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
    name = Column(String(100))
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
    source_title = Column(String(255))
    get_it = Column(String(255))
    artist = Column(String(255))

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


__all__ = [
    "Base",
    "Tgc",
    "User",
    "Card",
    "GundamCard",
    "OnePieceCard",
    "MagicCard",
    "UserCollection",
    "Deck",
    "DeckCard",
    "DeckConsideringCard",
]
