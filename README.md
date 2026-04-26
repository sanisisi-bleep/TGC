# TGC Collection Manager

A full-stack web application for managing trading card game collections.

## Features

- User registration and authentication
- Card database with versions
- User card collections with quantities
- Deck building
- View which decks contain specific cards
- Search pagination with cache-aware loading
- Opening hand simulator inside deck details
- Internal feedback inbox routed through the backend

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

## Performance

- Search responses use HTTP cache headers on the backend.
- Card facets are cached more aggressively because they change less often.
- The frontend uses TanStack Query with shared cache and longer stale times for catalog, collection and deck data.
- Search prefetches the next page in the background to make pagination feel faster.
- Collection filtering uses deferred rendering to keep typing smoother on larger inventories.

## Observability

- Every backend request gets an `X-Request-ID` response header for easier trace correlation in Vercel logs.
- The backend emits structured JSON logs with request context, user context and route-level mutation events.
- Slow requests are flagged automatically through `SLOW_REQUEST_THRESHOLD_MS` (default `1200` ms).
- `/health` can optionally check the database when `HEALTHCHECK_DATABASE=true`.
- Set `SHOW_HEALTH_ERRORS=true` only when you explicitly want database error details in the health payload.
- Optional log tuning:
  - `LOG_LEVEL`
  - `LOG_REQUEST_HEADERS=true`
  - `LOG_REQUEST_QUERY_VALUES=true`
  - `APP_ENVIRONMENT`
  - `LOG_SERVICE_NAME`

## CI/CD

The repo now includes GitHub Actions workflows:

- `.github/workflows/ci.yml`
  - Builds the frontend with `npm run build`
  - Installs backend dependencies
  - Runs `python -m compileall backend`
  - Imports `app.main` as a smoke check

- `.github/workflows/deploy-vercel.yml`
  - Deploys to Vercel after `CI` succeeds on `main`
  - Can also be launched manually with `workflow_dispatch`
  - Skips deployment automatically until the Vercel secrets are configured

### Secrets needed for Vercel deploy

- `VERCEL_TOKEN`

The workflow already includes the linked `orgId` and `projectId` for this repo, so only the token needs to be added in GitHub.

### Recommended GitHub setup

1. Protect `main`
2. Require the `CI` workflow to pass before merge
3. Use only one production deploy path

If you keep Vercel's native Git integration enabled, you may get duplicate deploys together with the GitHub deploy workflow. In that case, disable one of the two paths.
