from typing import List, Optional

from app.models import Card, Deck, DeckCard, DeckConsideringCard, DeckEggCard
from app.services.deck_service_payloads import DeckServicePayloadMixin
from app.services.deck_service_queries import DeckServiceQueryMixin
from app.services.deck_service_rules import DeckServiceRulesMixin
from app.services.game_rules import get_tcg_rules


class DeckService(DeckServicePayloadMixin, DeckServiceRulesMixin, DeckServiceQueryMixin):
    def __init__(self, db):
        self.db = db

    def create_deck(self, user_id: int, name: str, tgc_id: Optional[int] = None) -> Deck:
        resolved_tgc_id = tgc_id
        if resolved_tgc_id is None:
            default_tgc = self._get_default_tgc()
            resolved_tgc_id = default_tgc.id if default_tgc else None

        cleaned_name = (name or "").strip()
        if not cleaned_name:
            raise ValueError("Deck name cannot be empty")

        deck = Deck(user_id=user_id, tgc_id=resolved_tgc_id, name=cleaned_name[:100])
        self.db.add(deck)
        self.db.commit()
        self.db.refresh(deck)
        return deck

    def import_deck(
        self,
        user_id: int,
        name: Optional[str],
        tgc_id: Optional[int],
        cards: List[dict],
        egg_cards: Optional[List[dict]] = None,
    ):
        egg_cards = egg_cards or []
        if not cards and not egg_cards:
            raise ValueError("Imported deck must include at least one card")

        target_tgc = self._get_tgc_by_id(tgc_id) if tgc_id is not None else self._get_default_tgc()
        if tgc_id is not None and target_tgc is None:
            raise ValueError("Target TCG not found for imported deck")
        resolved_tgc_id = target_tgc.id if target_tgc else None
        rules = get_tcg_rules(target_tgc.name if target_tgc else None)

        aggregated_cards = {"main": {}, "egg": {}}
        deck_entries = []

        for raw_card in [*cards, *egg_cards]:
            quantity = int(raw_card.get("quantity") or 0)
            if quantity <= 0:
                raise ValueError("Imported card quantity must be greater than zero")

            card = self._resolve_import_card(resolved_tgc_id, raw_card)
            storage_section = self._get_card_storage_section(target_tgc, card)
            current_quantity = aggregated_cards[storage_section].get(card.id, 0)
            aggregated_cards[storage_section][card.id] = current_quantity + quantity

        for storage_section in ("main", "egg"):
            for card_id, quantity in aggregated_cards[storage_section].items():
                card = self.db.query(Card).filter(Card.id == card_id).first()
                deck_entries.append(
                    {
                        "deck_item": None,
                        "card": card,
                        "quantity": quantity,
                        "storage_section": storage_section,
                    }
                )

        self._validate_deck_composition(
            target_tgc,
            rules,
            deck_entries,
            deck_entries[0]["card"] if deck_entries else None,
            require_complete=True,
        )

        deck_name = (name or "").strip() or "Mazo importado"
        deck = Deck(user_id=user_id, tgc_id=resolved_tgc_id, name=deck_name[:100])
        self.db.add(deck)
        self.db.flush()

        for entry in deck_entries:
            model_class = DeckEggCard if entry["storage_section"] == "egg" else DeckCard
            self.db.add(
                model_class(
                    deck_id=deck.id,
                    card_id=entry["card"].id,
                    quantity=entry["quantity"],
                )
            )

        self.db.commit()
        self.db.refresh(deck)
        return deck

    def rename_deck(self, deck_id: int, user_id: int, name: str):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        cleaned_name = (name or "").strip()
        if not cleaned_name:
            raise ValueError("Deck name cannot be empty")

        deck.name = cleaned_name[:100]
        self.db.commit()
        self.db.refresh(deck)
        return deck

    def delete_deck(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        self.db.query(DeckCard).filter(DeckCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.query(DeckEggCard).filter(DeckEggCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.query(DeckConsideringCard).filter(DeckConsideringCard.deck_id == deck.id).delete(synchronize_session=False)
        self.db.delete(deck)
        self.db.commit()
        return deck

    def clone_deck(self, deck_id: int, user_id: int):
        source_deck = self._get_user_deck_or_error(deck_id, user_id)

        cloned_deck = Deck(
            user_id=user_id,
            tgc_id=source_deck.tgc_id,
            name=f"{source_deck.name} (Copia)",
        )
        self.db.add(cloned_deck)
        self.db.flush()

        source_cards = self.db.query(DeckCard).filter(DeckCard.deck_id == source_deck.id).all()
        for source_card in source_cards:
            self.db.add(
                DeckCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    quantity=source_card.quantity,
                    assigned_quantity=None,
                )
            )

        source_egg_cards = self.db.query(DeckEggCard).filter(DeckEggCard.deck_id == source_deck.id).all()
        for source_card in source_egg_cards:
            self.db.add(
                DeckEggCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    quantity=source_card.quantity,
                    assigned_quantity=None,
                )
            )

        source_considering_cards = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == source_deck.id)
            .all()
        )
        for source_card in source_considering_cards:
            self.db.add(
                DeckConsideringCard(
                    deck_id=cloned_deck.id,
                    card_id=source_card.card_id,
                    quantity=source_card.quantity,
                )
            )

        self.db.commit()
        self.db.refresh(cloned_deck)
        return cloned_deck

    def ensure_share_token(self, deck_id: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)

        if not deck.share_token:
            deck.share_token = self._generate_share_token()
            self.db.commit()
            self.db.refresh(deck)

        return deck

    def add_card_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        if not card:
            raise ValueError("Card not found")

        if card.tgc_id != (deck_tgc.id if deck_tgc else card.tgc_id):
            raise ValueError("Card belongs to a different TCG")

        storage_section = self._get_card_storage_section(deck_tgc, card)
        deck_card = self._get_storage_card_record(deck_id, card_id, storage_section)
        current_quantity = deck_card.quantity if deck_card else 0
        next_quantity = current_quantity + quantity
        total_cards_in_deck = self._get_storage_total_quantity(deck_id, storage_section)
        next_total = total_cards_in_deck - current_quantity + next_quantity

        self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)
        candidate_entries = self._build_candidate_deck_entries(deck_tgc, deck_id, card, next_quantity)
        self._validate_deck_composition(deck_tgc, rules, candidate_entries, card, is_increase=True)

        if deck_card:
            deck_card.quantity = next_quantity
            if deck_card.assigned_quantity is not None:
                deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
        else:
            model_class = DeckEggCard if storage_section == "egg" else DeckCard
            deck_card = model_class(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(deck_card)

        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "quantity": deck_card.quantity,
            "assigned_quantity": deck_card.assigned_quantity,
            "deck_section": storage_section,
        }

    def add_card_to_considering(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        if not card:
            raise ValueError("Card not found")

        if card.tgc_id != (deck_tgc.id if deck_tgc else card.tgc_id):
            raise ValueError("Card belongs to a different TCG")

        considering_card = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == deck_id, DeckConsideringCard.card_id == card_id)
            .first()
        )
        current_quantity = considering_card.quantity if considering_card else 0
        next_quantity = current_quantity + quantity
        self._validate_considering_quantity_rules(deck_tgc, rules, next_quantity, card)

        if considering_card:
            considering_card.quantity = next_quantity
        else:
            considering_card = DeckConsideringCard(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(considering_card)

        self.db.commit()
        self.db.refresh(considering_card)
        return {"quantity": considering_card.quantity}

    def adjust_considering_card_quantity(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        considering_card = self._get_deck_considering_card_or_error(deck_id, card_id)
        card = self.db.query(Card).filter(Card.id == card_id).first()

        next_quantity = considering_card.quantity + delta
        if next_quantity > 0:
            self._validate_considering_quantity_rules(deck_tgc, rules, next_quantity, card)

        if next_quantity <= 0:
            self.db.delete(considering_card)
            self.db.commit()
            return {"quantity": 0}

        considering_card.quantity = next_quantity
        self.db.commit()
        self.db.refresh(considering_card)
        return {"quantity": considering_card.quantity}

    def move_card_to_considering(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if quantity > deck_card.quantity:
            raise ValueError("Not enough copies in deck to move")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        considering_card = (
            self.db.query(DeckConsideringCard)
            .filter(DeckConsideringCard.deck_id == deck_id, DeckConsideringCard.card_id == card_id)
            .first()
        )
        current_considering_quantity = considering_card.quantity if considering_card else 0
        next_considering_quantity = current_considering_quantity + quantity
        self._validate_considering_quantity_rules(deck_tgc, rules, next_considering_quantity, card)

        if considering_card:
            considering_card.quantity = next_considering_quantity
        else:
            considering_card = DeckConsideringCard(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(considering_card)

        next_deck_quantity = deck_card.quantity - quantity
        if next_deck_quantity <= 0:
            self.db.delete(deck_card)
            assigned_quantity = None
        else:
            deck_card.quantity = next_deck_quantity
            if deck_card.assigned_quantity is not None:
                deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
            assigned_quantity = deck_card.assigned_quantity

        self.db.commit()
        self.db.refresh(considering_card)
        return {
            "deck_quantity": max(next_deck_quantity, 0),
            "deck_section": storage_section,
            "considering_quantity": considering_card.quantity,
            "assigned_quantity": assigned_quantity,
        }

    def move_card_from_considering_to_deck(self, deck_id: int, card_id: int, quantity: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        considering_card = self._get_deck_considering_card_or_error(deck_id, card_id)

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")
        if quantity > considering_card.quantity:
            raise ValueError("Not enough copies in considering to move")

        card = self.db.query(Card).filter(Card.id == card_id).first()
        storage_section = self._get_card_storage_section(deck_tgc, card)
        deck_card = self._get_storage_card_record(deck_id, card_id, storage_section)
        current_quantity = deck_card.quantity if deck_card else 0
        next_quantity = current_quantity + quantity
        total_cards_in_deck = self._get_storage_total_quantity(deck_id, storage_section)
        next_total = total_cards_in_deck - current_quantity + next_quantity

        self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)
        candidate_entries = self._build_candidate_deck_entries(deck_tgc, deck_id, card, next_quantity)
        self._validate_deck_composition(deck_tgc, rules, candidate_entries, card, is_increase=True)

        if deck_card:
            deck_card.quantity = next_quantity
        else:
            model_class = DeckEggCard if storage_section == "egg" else DeckCard
            deck_card = model_class(deck_id=deck_id, card_id=card_id, quantity=quantity)
            self.db.add(deck_card)

        next_considering_quantity = considering_card.quantity - quantity
        if next_considering_quantity <= 0:
            self.db.delete(considering_card)
            considering_quantity = 0
        else:
            considering_card.quantity = next_considering_quantity
            considering_quantity = considering_card.quantity

        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "deck_quantity": deck_card.quantity,
            "deck_section": storage_section,
            "considering_quantity": considering_quantity,
            "assigned_quantity": deck_card.assigned_quantity,
        }

    def adjust_deck_card_quantity(self, deck_id: int, card_id: int, delta: int, user_id: int):
        deck = self._get_user_deck_or_error(deck_id, user_id)
        deck_tgc, rules = self._get_rules_for_deck(deck)
        storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)
        card = self.db.query(Card).filter(Card.id == card_id).first()

        next_quantity = deck_card.quantity + delta
        total_cards_in_deck = self._get_storage_total_quantity(deck_id, storage_section)
        next_total = total_cards_in_deck - deck_card.quantity + max(next_quantity, 0)

        if next_quantity > 0:
            self._validate_generic_quantity_rules(deck_tgc, rules, next_quantity, next_total, card)

        candidate_entries = self._build_candidate_deck_entries(deck_tgc, deck_id, card, max(next_quantity, 0))
        composition = self._validate_deck_composition(
            deck_tgc,
            rules,
            candidate_entries,
            card,
            is_increase=delta > 0,
        )
        candidate_total_cards = sum(entry["quantity"] for entry in candidate_entries)
        deck_overview = self._build_deck_response_base(
            deck,
            deck_tgc,
            rules,
            composition,
            candidate_total_cards,
        )

        if next_quantity <= 0:
            self.db.delete(deck_card)
            self.db.commit()
            return {
                "quantity": 0,
                "deck_section": storage_section,
                "assigned_quantity": None,
                "deck": deck_overview,
            }

        deck_card.quantity = next_quantity
        if deck_card.assigned_quantity is not None:
            deck_card.assigned_quantity = min(deck_card.assigned_quantity, deck_card.quantity)
        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "quantity": deck_card.quantity,
            "deck_section": storage_section,
            "assigned_quantity": deck_card.assigned_quantity,
            "deck": deck_overview,
        }

    def adjust_deck_card_assignment(self, deck_id: int, card_id: int, delta: int, user_id: int):
        self._get_user_deck_or_error(deck_id, user_id)
        storage_section, deck_card = self._get_any_deck_card_or_error(deck_id, card_id)

        owned_quantity = self._get_owned_quantity(user_id, card_id)
        max_coverable_quantity = min(deck_card.quantity, owned_quantity)
        current_assignment = (
            deck_card.assigned_quantity
            if deck_card.assigned_quantity is not None
            else max_coverable_quantity
        )
        next_assignment = max(min(current_assignment + delta, max_coverable_quantity), 0)

        if next_assignment == max_coverable_quantity:
            deck_card.assigned_quantity = None
        else:
            deck_card.assigned_quantity = next_assignment

        self.db.commit()
        self.db.refresh(deck_card)
        return {
            "quantity": deck_card.quantity,
            "deck_section": storage_section,
            "assigned_quantity": deck_card.assigned_quantity,
        }
