#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import get_db
from app.models import Card, UserCollection, User
from sqlalchemy.orm import Session

def main():
    db: Session = next(get_db())

    print("=== CARDS IN DATABASE ===")
    cards = db.query(Card).limit(10).all()
    for card in cards:
        print(f"ID: {card.id}, Name: {card.name}, Type: {card.card_type}")

    print("\n=== USERS IN DATABASE ===")
    users = db.query(User).all()
    for user in users:
        print(f"ID: {user.id}, Username: {user.username}")

    print("\n=== USER COLLECTIONS ===")
    collections = db.query(UserCollection).all()
    for col in collections:
        print(f"User: {col.user_id}, Card: {col.card_id}, Qty: {col.quantity}")

    db.close()

if __name__ == "__main__":
    main()