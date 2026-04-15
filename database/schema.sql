-- Database schema for TGC Collection Manager
-- Synced with backend/app/models/__init__.py

CREATE TABLE tgc (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE cards (
    id SERIAL PRIMARY KEY,
    tgc_id INTEGER REFERENCES tgc(id) ON DELETE CASCADE,
    source_card_id VARCHAR(50),
    name VARCHAR(100),
    card_type VARCHAR(50),
    lv INTEGER,
    cost INTEGER,
    ap INTEGER,
    hp INTEGER,
    color VARCHAR(20),
    rarity VARCHAR(20),
    set_name VARCHAR(255),
    version VARCHAR(50),
    block INTEGER,
    traits TEXT,
    link TEXT,
    zones TEXT,
    artist VARCHAR(255),
    abilities TEXT,
    description TEXT,
    image_url TEXT
);

CREATE INDEX idx_cards_source_card_id ON cards(source_card_id);
CREATE UNIQUE INDEX idx_cards_tgc_source_card_id
    ON cards(tgc_id, source_card_id);

CREATE TABLE gundam_cards (
    card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    level INTEGER,
    ap INTEGER,
    hp INTEGER,
    block INTEGER,
    zone TEXT,
    trait TEXT,
    link TEXT,
    effect TEXT,
    source_title VARCHAR(255),
    get_it VARCHAR(255),
    artist VARCHAR(255)
);

CREATE TABLE one_piece_cards (
    card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    attribute_name VARCHAR(100),
    attribute_image VARCHAR(255),
    power INTEGER,
    family TEXT,
    ability TEXT,
    counter VARCHAR(20),
    trigger TEXT,
    notes TEXT
);

CREATE TABLE magic_cards (
    card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    colors TEXT,
    set_name VARCHAR(255),
    power VARCHAR(20),
    toughness VARCHAR(20),
    mana_cost VARCHAR(100),
    cmc INTEGER,
    color_identity TEXT,
    text TEXT,
    type_line TEXT,
    typal TEXT,
    keywords TEXT,
    image_url TEXT
);

CREATE TABLE user_collections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_user_collections_user_card
    ON user_collections(user_id, card_id);

CREATE TABLE decks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tgc_id INTEGER REFERENCES tgc(id) ON DELETE CASCADE,
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deck_cards (
    id SERIAL PRIMARY KEY,
    deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,
    card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_deck_cards_deck_card
    ON deck_cards(deck_id, card_id);
