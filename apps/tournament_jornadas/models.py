from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

try:
    from .database import Base
except ImportError:  # pragma: no cover
    from database import Base


class TournamentConfig(Base):
    __tablename__ = "tj_tournament_config"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False, default="Torneos de Discord de Zurgo")
    requested_weeks = Column(Integer, nullable=False, default=4)
    generated_weeks = Column(Integer, nullable=False, default=0)
    registration_open = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class TournamentUser(Base):
    __tablename__ = "tj_users"

    id = Column(Integer, primary_key=True)
    username = Column(String(120), nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(20), nullable=False, default="user")
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Player(Base):
    __tablename__ = "tj_players"

    id = Column(Integer, primary_key=True)
    display_name = Column(String(120), nullable=False)
    deck_url = Column(Text, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    seats = relationship("TableSeat", back_populates="player", cascade="all, delete-orphan")
    result_entries = relationship("ResultEntry", back_populates="player", cascade="all, delete-orphan")


class Week(Base):
    __tablename__ = "tj_weeks"

    id = Column(Integer, primary_key=True)
    week_number = Column(Integer, nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tables = relationship("MatchTable", back_populates="week", cascade="all, delete-orphan")


class MatchTable(Base):
    __tablename__ = "tj_match_tables"
    __table_args__ = (UniqueConstraint("week_id", "table_number", name="uq_tj_week_table"),)

    id = Column(Integer, primary_key=True)
    week_id = Column(Integer, ForeignKey("tj_weeks.id", ondelete="CASCADE"), nullable=False)
    table_number = Column(Integer, nullable=False)

    week = relationship("Week", back_populates="tables")
    seats = relationship("TableSeat", back_populates="table", cascade="all, delete-orphan")
    submissions = relationship("ResultSubmission", back_populates="table", cascade="all, delete-orphan")


class TableSeat(Base):
    __tablename__ = "tj_table_seats"
    __table_args__ = (UniqueConstraint("table_id", "player_id", name="uq_tj_table_player"),)

    id = Column(Integer, primary_key=True)
    table_id = Column(Integer, ForeignKey("tj_match_tables.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("tj_players.id", ondelete="CASCADE"), nullable=False)
    seat_number = Column(Integer, nullable=False)

    table = relationship("MatchTable", back_populates="seats")
    player = relationship("Player", back_populates="seats")


class ResultSubmission(Base):
    __tablename__ = "tj_result_submissions"

    id = Column(Integer, primary_key=True)
    table_id = Column(Integer, ForeignKey("tj_match_tables.id", ondelete="CASCADE"), nullable=False)
    submitted_by = Column(String(120), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    notes = Column(Text, nullable=False, default="")
    admin_notes = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String(120), nullable=True)

    table = relationship("MatchTable", back_populates="submissions")
    entries = relationship("ResultEntry", back_populates="submission", cascade="all, delete-orphan")


class ResultEntry(Base):
    __tablename__ = "tj_result_entries"
    __table_args__ = (UniqueConstraint("submission_id", "player_id", name="uq_tj_submission_player"),)

    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("tj_result_submissions.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("tj_players.id", ondelete="CASCADE"), nullable=False)
    placement = Column(Integer, nullable=False)
    result_type = Column(String(20), nullable=False, default="normal")
    points_awarded = Column(Integer, nullable=False, default=0)

    submission = relationship("ResultSubmission", back_populates="entries")
    player = relationship("Player", back_populates="result_entries")
