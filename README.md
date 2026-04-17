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

1. `cd backend`
2. Set your database environment variables in `backend/.env` or Vercel
3. Run `python populate_db.py` to populate cards from ExBurst.dev
4. For development: `uvicorn app.main:app --reload`
5. For production outside Vercel: `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker`

### Frontend

#### Opcion 1: Node.js nativo

1. Install Node.js from https://nodejs.org/
2. `cd frontend`
3. `npm install`
4. `npm start`

#### Opcion 2: Docker

1. Make sure Docker is installed: https://www.docker.com/get-started/
2. `cd frontend`
3. Build the image: `docker build -t tgc-frontend .`
4. Run the container: `docker run -p 3000:3000 tgc-frontend`
5. Open `http://localhost:3000`

### Paginas

- **Inicio**: Login/Register, bienvenida
- **Buscar Cartas**: Buscador con filtros por tipo, color, rareza
- **Mi Coleccion**: Ver cartas propias, agregar a mazos
- **Mis Mazos**: Crear y gestionar mazos
- **Configuracion**: Cambiar contrasena (por implementar)

## Database Schema

- `tgc`: Games (for example, Gundam TCG)
- `users`: User accounts
- `cards`: Card catalog with stats and metadata
- `user_collections`: Cards owned by each user
- `decks`: User decks
- `deck_cards`: Cards assigned to decks

## API Endpoints

- `POST /register` - Register user
- `POST /token` - Login
- `GET /tgc` - Get all TCG games
- `POST /tgc` - Create TCG (admin)
- `GET /cards` - Get all cards
- `POST /cards` - Create card
- `GET /collection` - Get user collection
- `POST /collection` - Add card to collection
- `GET /decks` - Get user decks
- `POST /decks` - Create deck
- `POST /decks/{id}/cards` - Add card to deck

## Deploy En Vercel

The repository is configured to deploy frontend and backend together in one Vercel project using `experimentalServices`:

- `frontend` is served at `/`
- `backend` FastAPI is served at `/api`

### Requirements

1. In Vercel, set the project Framework Preset to `Services`.
2. The backend service installs dependencies from `backend/requirements.txt`.
3. The frontend uses `/api` by default in production, so it does not need a separate backend URL.

### Recommended environment variables

- `SECRET_KEY`
- `DATABASE_URL` or `DATABASE_URL_PRE` / `DATABASE_URL_PRO`
- `DATABASE_TARGET` if you want to choose `PRE` or `PRO`
- `ALLOWED_ORIGINS` only if the backend will be consumed from a different origin
- `INIT_DB_ON_STARTUP=true` if you want the backend to attempt schema creation/adjustments during startup

### Local development

- Frontend: `cd frontend && npm start`
- Backend: `cd backend && uvicorn app.main:app --reload`
- Both services with Vercel locally: `vercel dev -L`
