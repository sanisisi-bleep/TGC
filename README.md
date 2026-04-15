# TGC Collection Manager

A full-stack web application for managing trading card game collections.

## Features

- User registration and authentication
- Card database with versions
- User card collections with quantities
- Deck building
- View which decks contain specific cards

## Setup

### Database

1. Install PostgreSQL
2. Create a database named `tgc_db`
3. Run the schema: `psql -d tgc_db -f database/schema.sql`

### Backend

1. cd backend
2. Update DATABASE_URL in app/database/connection.py
3. Run: `python populate_db.py` to populate cards from ExBurst.dev
4. For development: `uvicorn app.main:app --reload`
5. For production: `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker`

## Frontend

#### Opción 1: Node.js Nativo
1. Instala Node.js desde https://nodejs.org/
2. cd frontend
3. npm install
4. npm start

#### Opción 2: Docker (Recomendado)
1. Asegúrate de tener Docker instalado: https://www.docker.com/get-started/
2. cd frontend
3. Construye la imagen: `docker build -t tgc-frontend .`
4. Ejecuta el contenedor: `docker run -p 3000:3000 tgc-frontend`
5. Accede a http://localhost:3000

### Páginas
- **Inicio**: Login/Register, bienvenida
- **Buscar Cartas**: Buscador con filtros por tipo, color, rareza
- **Mi Colección**: Ver cartas propias, agregar a mazos
- **Mis Mazos**: Crear y gestionar mazos
- **Configuración**: Cambiar contraseña (por implementar)

## Database Schema

- tgc: Games (e.g., Gundam TGC)
- users: User accounts
- cards: Cards with attributes like type (Unit/Pilot/Command/Base), lv, cost, ap, hp, color, rarity, set, etc.
- user_collections: User's owned cards with quantities
- decks: User decks
- deck_cards: Cards in decks with quantities

## API Endpoints

- POST /register - Register user
- POST /token - Login
- GET /tgc - Get all TGC games
- POST /tgc - Create TGC (admin)
- GET /cards - Get all cards
- POST /cards - Create card
- GET /collection - Get user collection
- POST /collection - Add card to collection
- GET /decks - Get user decks
- POST /decks - Create deck
- POST /decks/{id}/cards - Add card to deck