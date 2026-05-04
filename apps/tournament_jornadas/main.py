from __future__ import annotations

import os
import secrets
from datetime import datetime
from urllib.parse import unquote_plus

from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from starlette.middleware.sessions import SessionMiddleware

try:
    from .database import get_db, init_db
    from .models import MatchTable, Player, ResultEntry, ResultSubmission, TableSeat, TournamentConfig, TournamentUser, Week
    from .render import (
        redirect_with_message,
        render_home,
        render_player_page,
        render_report_page,
        render_schedule_admin,
        render_staff_login,
        render_staff_reviews,
        render_staff_users,
        render_standings_page,
        render_week_page,
    )
    from .scheduler import generate_schedule
    from .security import hash_password, verify_password
except ImportError:  # pragma: no cover
    from database import get_db, init_db
    from models import MatchTable, Player, ResultEntry, ResultSubmission, TableSeat, TournamentConfig, TournamentUser, Week
    from render import (
        redirect_with_message,
        render_home,
        render_player_page,
        render_report_page,
        render_schedule_admin,
        render_staff_login,
        render_staff_reviews,
        render_staff_users,
        render_standings_page,
        render_week_page,
    )
    from scheduler import generate_schedule
    from security import hash_password, verify_password


APP_PREFIX = ""
POINTS_BY_PLACEMENT = {1: 4, 2: 3, 3: 2, 4: 1}
RESULT_TYPE_LABELS = {
    "normal": "Normal",
    "surrender": "Se ha rendido",
    "cheating": "Trampas detectadas",
}
SUBMISSION_STATUS_LABELS = {
    "pending": "Pendiente",
    "approved": "Aprobado",
    "rejected": "Rechazado",
    "replaced": "Sustituido",
}
VALID_ROLES = {"admin", "moderator", "user"}
STAFF_REVIEW_ROLES = {"admin", "moderator"}


app = FastAPI(title="Torneos de Discord de Zurgo")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("TOURNAMENT_SESSION_SECRET", secrets.token_urlsafe(32)),
)
app.mount(
    f"{APP_PREFIX}/static",
    StaticFiles(directory=str((__import__("pathlib").Path(__file__).resolve().parent / "static"))),
    name="tj_static",
)

init_db()


def _get_bootstrap_admin_username() -> str:
    return (os.getenv("TOURNAMENT_ADMIN_USERNAME", "admin").strip() or "admin")


def _get_bootstrap_admin_password() -> str:
    return os.getenv("TOURNAMENT_ADMIN_PASSWORD", "admin123")


def _flash_from_request(request: Request) -> dict | None:
    flash_type = request.query_params.get("flash_type")
    flash_message = request.query_params.get("flash_message")
    if not flash_type or not flash_message:
        return None
    return {
        "type": unquote_plus(flash_type),
        "message": unquote_plus(flash_message),
    }


def _current_role(request: Request) -> str:
    return request.session.get("tj_role", "guest")


def _current_username(request: Request) -> str | None:
    return request.session.get("tj_username")


def _is_role_allowed(request: Request, allowed_roles: set[str]) -> bool:
    return _current_role(request) in allowed_roles


def _require_roles(request: Request, allowed_roles: set[str]):
    if not _is_role_allowed(request, allowed_roles):
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_admin(request: Request):
    _require_roles(request, {"admin"})


def _require_reviewer(request: Request):
    _require_roles(request, STAFF_REVIEW_ROLES)


def _ensure_tournament_config(db: Session) -> TournamentConfig:
    config = db.query(TournamentConfig).filter(TournamentConfig.id == 1).first()
    if config:
        return config

    config = TournamentConfig(id=1)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def _ensure_bootstrap_admin(db: Session):
    username = _get_bootstrap_admin_username()
    password = _get_bootstrap_admin_password()
    existing = db.query(TournamentUser).filter(TournamentUser.username == username).first()
    if existing:
        if existing.role != "admin":
            existing.role = "admin"
            db.commit()
        return existing

    admin_user = TournamentUser(
        username=username,
        password_hash=hash_password(password),
        role="admin",
        active=True,
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    return admin_user


def _parse_import_lines(raw_text: str) -> list[tuple[str, str]]:
    players = []
    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        for separator in ("|", ";", "\t", ","):
            if separator in line:
                name, deck_url = [part.strip() for part in line.split(separator, 1)]
                if name and deck_url:
                    players.append((name, deck_url))
                break
        else:
            raise ValueError(f"No se pudo leer la linea: {line}")

    return players


def _reset_schedule(db: Session):
    db.query(ResultEntry).delete()
    db.query(ResultSubmission).delete()
    db.query(TableSeat).delete()
    db.query(MatchTable).delete()
    db.query(Week).delete()
    db.commit()


def _player_rounds(db: Session, player: Player) -> list[dict]:
    seats = (
        db.query(TableSeat)
        .options(
            joinedload(TableSeat.table).joinedload(MatchTable.week),
            joinedload(TableSeat.table).joinedload(MatchTable.seats).joinedload(TableSeat.player),
        )
        .filter(TableSeat.player_id == player.id)
        .all()
    )

    rounds = []
    for seat in sorted(seats, key=lambda item: item.table.week.week_number):
        opponents = [
            {
                "player_id": other.player.id,
                "display_name": other.player.display_name,
                "deck_url": other.player.deck_url,
            }
            for other in seat.table.seats
            if other.player_id != player.id
        ]
        rounds.append(
            {
                "week_number": seat.table.week.week_number,
                "table_number": seat.table.table_number,
                "opponents": opponents,
            }
        )
    return rounds


def _table_submission_status(table: MatchTable) -> tuple[str, str]:
    approved = next((submission for submission in table.submissions if submission.status == "approved"), None)
    if approved:
        return "approved", "Resultados aprobados"

    pending = next((submission for submission in table.submissions if submission.status == "pending"), None)
    if pending:
        return "pending", "Pendiente de revision"

    return "missing", "Sin resultado enviado"


def _standings(db: Session) -> list[dict]:
    players = db.query(Player).filter(Player.active.is_(True)).order_by(Player.display_name.asc()).all()
    scoreboard = {
        player.id: {
            "player_id": player.id,
            "display_name": player.display_name,
            "points": 0,
            "wins": 0,
            "seconds": 0,
            "thirds": 0,
            "fourths": 0,
            "zeroes": 0,
        }
        for player in players
    }

    approved_entries = (
        db.query(ResultEntry)
        .join(ResultSubmission, ResultSubmission.id == ResultEntry.submission_id)
        .filter(ResultSubmission.status == "approved")
        .options(joinedload(ResultEntry.player))
        .all()
    )

    for entry in approved_entries:
        row = scoreboard.setdefault(
            entry.player_id,
            {
                "player_id": entry.player_id,
                "display_name": entry.player.display_name,
                "points": 0,
                "wins": 0,
                "seconds": 0,
                "thirds": 0,
                "fourths": 0,
                "zeroes": 0,
            },
        )
        row["points"] += int(entry.points_awarded or 0)

        if entry.result_type != "normal":
            row["zeroes"] += 1
            continue

        if entry.placement == 1:
            row["wins"] += 1
        elif entry.placement == 2:
            row["seconds"] += 1
        elif entry.placement == 3:
            row["thirds"] += 1
        elif entry.placement == 4:
            row["fourths"] += 1

    ordered = sorted(
        scoreboard.values(),
        key=lambda row: (
            -row["points"],
            -row["wins"],
            -row["seconds"],
            -row["thirds"],
            row["display_name"].lower(),
        ),
    )

    for index, row in enumerate(ordered, start=1):
        row["rank"] = index

    return ordered


def _pending_review_count(db: Session) -> int:
    return db.query(ResultSubmission).filter(ResultSubmission.status == "pending").count()


def _render_context_kwargs(request: Request) -> dict:
    return {
        "current_role": _current_role(request),
        "current_username": _current_username(request),
    }


@app.get(APP_PREFIX + "/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(get_db)):
    _ensure_bootstrap_admin(db)
    config = _ensure_tournament_config(db)
    players = db.query(Player).order_by(Player.active.desc(), Player.display_name.asc(), Player.id.asc()).all()
    weeks = db.query(Week).order_by(Week.week_number.asc()).all()
    week_cards = []
    for week in weeks:
        table_count = db.query(MatchTable).filter(MatchTable.week_id == week.id).count()
        week_cards.append({"week_number": week.week_number, "table_count": table_count})

    context = {
        "tournament": {
            "name": config.name,
            "requested_weeks": config.requested_weeks,
            "generated_weeks": config.generated_weeks,
        },
        "players": [
            {
                "id": player.id,
                "display_name": player.display_name,
                "deck_url": player.deck_url,
                "active": player.active,
            }
            for player in players
        ],
        "weeks": week_cards,
        "active_player_count": sum(1 for player in players if player.active),
        "pending_reviews": _pending_review_count(db),
        "standings": _standings(db),
        "schedule_admin_link": "/admin/schedule" if _current_role(request) == "admin" else None,
    }
    return render_home(context, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.post(APP_PREFIX + "/players/register")
def register_player(
    display_name: str = Form(...),
    deck_url: str = Form(...),
    db: Session = Depends(get_db),
):
    db.add(Player(display_name=display_name.strip(), deck_url=deck_url.strip()))
    db.commit()
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/", "Jugador inscrito correctamente."),
        status_code=303,
    )


@app.post(APP_PREFIX + "/players/import")
def import_players(
    player_list: str = Form(""),
    db: Session = Depends(get_db),
):
    try:
        parsed_players = _parse_import_lines(player_list)
    except ValueError as error:
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/", str(error), "error"),
            status_code=303,
        )

    if not parsed_players:
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/", "No habia jugadores validos para importar.", "error"),
            status_code=303,
        )

    for display_name, deck_url in parsed_players:
        db.add(Player(display_name=display_name, deck_url=deck_url))
    db.commit()

    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/", f"Importados {len(parsed_players)} jugadores."),
        status_code=303,
    )


@app.get(APP_PREFIX + "/admin/schedule", response_class=HTMLResponse)
def admin_schedule(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    config = _ensure_tournament_config(db)
    players = db.query(Player).filter(Player.active.is_(True)).order_by(Player.display_name.asc(), Player.id.asc()).all()
    context = {
        "tournament": {
            "name": config.name,
            "requested_weeks": config.requested_weeks,
            "generated_weeks": config.generated_weeks,
        },
        "active_player_count": len(players),
        "players": [
            {
                "display_name": player.display_name,
                "deck_url": player.deck_url,
            }
            for player in players
        ],
    }
    return render_schedule_admin(context, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.post(APP_PREFIX + "/admin/schedule/generate")
def generate_tournament_schedule(
    request: Request,
    name: str = Form(...),
    requested_weeks: int = Form(...),
    db: Session = Depends(get_db),
):
    _require_admin(request)
    config = _ensure_tournament_config(db)
    players = db.query(Player).filter(Player.active.is_(True)).order_by(Player.id.asc()).all()

    try:
        schedule = generate_schedule([player.id for player in players], requested_weeks)
    except ValueError as error:
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/admin/schedule", str(error), "error"),
            status_code=303,
        )

    _reset_schedule(db)

    for week_index, groups in enumerate(schedule, start=1):
        week = Week(week_number=week_index)
        db.add(week)
        db.flush()

        for table_number, group in enumerate(groups, start=1):
            table = MatchTable(week_id=week.id, table_number=table_number)
            db.add(table)
            db.flush()
            for seat_number, player_id in enumerate(group, start=1):
                db.add(TableSeat(table_id=table.id, player_id=player_id, seat_number=seat_number))

    config.name = name.strip()
    config.requested_weeks = requested_weeks
    config.generated_weeks = len(schedule)
    db.commit()

    message = (
        f"Calendario generado con {len(schedule)} semanas."
        if len(schedule) == requested_weeks
        else f"Solo se pudieron generar {len(schedule)} semanas sin repetir rivales."
    )
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/admin/schedule", message),
        status_code=303,
    )


@app.get(APP_PREFIX + "/players/{player_id}", response_class=HTMLResponse)
def player_detail(player_id: int, request: Request, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")

    context = {
        "player": {
            "id": player.id,
            "display_name": player.display_name,
            "deck_url": player.deck_url,
        },
        "rounds": _player_rounds(db, player),
    }
    return render_player_page(context, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.get(APP_PREFIX + "/weeks/{week_number}", response_class=HTMLResponse)
def week_detail(week_number: int, request: Request, db: Session = Depends(get_db)):
    week = (
        db.query(Week)
        .options(
            joinedload(Week.tables).joinedload(MatchTable.seats).joinedload(TableSeat.player),
            joinedload(Week.tables).joinedload(MatchTable.submissions),
        )
        .filter(Week.week_number == week_number)
        .first()
    )
    if not week:
        raise HTTPException(status_code=404, detail="Semana no encontrada")

    tables = []
    for table in sorted(week.tables, key=lambda item: item.table_number):
        status_code, status_label = _table_submission_status(table)
        tables.append(
            {
                "table_number": table.table_number,
                "status_code": status_code,
                "status_label": status_label,
                "seats": [
                    {
                        "player_id": seat.player.id,
                        "display_name": seat.player.display_name,
                        "deck_url": seat.player.deck_url,
                    }
                    for seat in sorted(table.seats, key=lambda item: item.seat_number)
                ],
            }
        )

    context = {
        "week": {"week_number": week.week_number},
        "tables": tables,
    }
    return render_week_page(context, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.get(APP_PREFIX + "/weeks/{week_number}/tables/{table_number}/report", response_class=HTMLResponse)
def report_table_form(week_number: int, table_number: int, request: Request, db: Session = Depends(get_db)):
    table = (
        db.query(MatchTable)
        .join(Week, Week.id == MatchTable.week_id)
        .options(joinedload(MatchTable.seats).joinedload(TableSeat.player))
        .filter(Week.week_number == week_number, MatchTable.table_number == table_number)
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    context = {
        "week": {"week_number": week_number},
        "table": {"table_number": table_number},
        "seats": [
            {"player_id": seat.player.id, "display_name": seat.player.display_name}
            for seat in sorted(table.seats, key=lambda item: item.seat_number)
        ],
    }
    return render_report_page(context, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.post(APP_PREFIX + "/weeks/{week_number}/tables/{table_number}/report")
async def submit_table_report(week_number: int, table_number: int, request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    table = (
        db.query(MatchTable)
        .join(Week, Week.id == MatchTable.week_id)
        .options(joinedload(MatchTable.seats).joinedload(TableSeat.player))
        .filter(Week.week_number == week_number, MatchTable.table_number == table_number)
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    submitted_by = (form.get("submitted_by") or "").strip()
    notes = (form.get("notes") or "").strip()
    if not submitted_by:
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/weeks/{week_number}/tables/{table_number}/report", "Hace falta indicar quien envia el resultado.", "error"),
            status_code=303,
        )

    placements = []
    seen_placements = set()
    for seat in table.seats:
        placement = int(form.get(f"placement_{seat.player_id}") or 0)
        result_type = (form.get(f"result_type_{seat.player_id}") or "normal").strip()
        if placement not in {1, 2, 3, 4}:
            return RedirectResponse(
                redirect_with_message(f"{APP_PREFIX}/weeks/{week_number}/tables/{table_number}/report", "Todos los puestos deben ir del 1 al 4.", "error"),
                status_code=303,
            )
        if placement in seen_placements:
            return RedirectResponse(
                redirect_with_message(f"{APP_PREFIX}/weeks/{week_number}/tables/{table_number}/report", "No puede repetirse el mismo puesto en una mesa.", "error"),
                status_code=303,
            )
        seen_placements.add(placement)
        points_awarded = 0 if result_type in {"surrender", "cheating"} else POINTS_BY_PLACEMENT[placement]
        placements.append(
            {
                "player_id": seat.player_id,
                "placement": placement,
                "result_type": result_type,
                "points_awarded": points_awarded,
            }
        )

    submission = ResultSubmission(
        table_id=table.id,
        submitted_by=submitted_by,
        notes=notes,
        status="pending",
    )
    db.add(submission)
    db.flush()

    for entry in placements:
        db.add(ResultEntry(submission_id=submission.id, **entry))

    db.commit()

    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/weeks/{week_number}", "Resultado enviado para revision."),
        status_code=303,
    )


@app.get(APP_PREFIX + "/standings", response_class=HTMLResponse)
def standings_page(request: Request, db: Session = Depends(get_db)):
    return render_standings_page({"standings": _standings(db)}, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.get(APP_PREFIX + "/staff/login", response_class=HTMLResponse)
def staff_login_page(request: Request, db: Session = Depends(get_db)):
    _ensure_bootstrap_admin(db)
    return render_staff_login(flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.post(APP_PREFIX + "/staff/login")
def staff_login(request: Request, username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    _ensure_bootstrap_admin(db)
    user = db.query(TournamentUser).filter(TournamentUser.username == username.strip()).first()
    if not user or not user.active or not verify_password(password, user.password_hash):
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/staff/login", "Credenciales incorrectas.", "error"),
            status_code=303,
        )

    request.session["tj_user_id"] = user.id
    request.session["tj_username"] = user.username
    request.session["tj_role"] = user.role
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/", f"Sesion iniciada como {user.role}."),
        status_code=303,
    )


@app.post(APP_PREFIX + "/staff/logout")
def staff_logout(request: Request):
    for key in ("tj_user_id", "tj_username", "tj_role"):
        request.session.pop(key, None)
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/", "Sesion cerrada."),
        status_code=303,
    )


@app.get(APP_PREFIX + "/staff/reviews", response_class=HTMLResponse)
def staff_reviews(request: Request, db: Session = Depends(get_db)):
    _require_reviewer(request)

    submissions = (
        db.query(ResultSubmission)
        .options(
            joinedload(ResultSubmission.table).joinedload(MatchTable.week),
            joinedload(ResultSubmission.entries).joinedload(ResultEntry.player),
        )
        .filter(ResultSubmission.status == "pending")
        .order_by(ResultSubmission.created_at.asc(), ResultSubmission.id.asc())
        .all()
    )

    payload = []
    for submission in submissions:
        payload.append(
            {
                "id": submission.id,
                "week_number": submission.table.week.week_number,
                "table_number": submission.table.table_number,
                "submitted_by": submission.submitted_by,
                "status": submission.status,
                "status_label": SUBMISSION_STATUS_LABELS.get(submission.status, submission.status),
                "notes": submission.notes,
                "entries": [
                    {
                        "display_name": entry.player.display_name,
                        "placement": entry.placement,
                        "result_type_label": RESULT_TYPE_LABELS.get(entry.result_type, entry.result_type),
                        "points_awarded": entry.points_awarded,
                    }
                    for entry in sorted(submission.entries, key=lambda item: item.placement)
                ],
            }
        )

    return render_staff_reviews({"submissions": payload}, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.get(APP_PREFIX + "/admin/users", response_class=HTMLResponse)
def admin_users(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    users = db.query(TournamentUser).order_by(TournamentUser.created_at.asc(), TournamentUser.id.asc()).all()
    payload = [
        {
            "username": user.username,
            "role": user.role,
            "active": user.active,
            "created_at": user.created_at.strftime("%Y-%m-%d"),
        }
        for user in users
    ]
    return render_staff_users({"users": payload}, flash=_flash_from_request(request), **_render_context_kwargs(request))


@app.post(APP_PREFIX + "/admin/users")
def create_staff_user(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    role: str = Form(...),
    db: Session = Depends(get_db),
):
    _require_admin(request)
    normalized_username = username.strip()
    normalized_role = role.strip().lower()

    if normalized_role not in VALID_ROLES:
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/admin/users", "Rol no valido.", "error"),
            status_code=303,
        )
    if not normalized_username:
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/admin/users", "El usuario no puede quedar vacio.", "error"),
            status_code=303,
        )
    if db.query(TournamentUser).filter(TournamentUser.username == normalized_username).first():
        return RedirectResponse(
            redirect_with_message(f"{APP_PREFIX}/admin/users", "Ese usuario ya existe.", "error"),
            status_code=303,
        )

    db.add(
        TournamentUser(
            username=normalized_username,
            password_hash=hash_password(password),
            role=normalized_role,
            active=True,
        )
    )
    db.commit()
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/admin/users", f"Usuario {normalized_username} creado con rol {normalized_role}."),
        status_code=303,
    )


def _review_submission(db: Session, submission_id: int, reviewer: str, next_status: str):
    submission = (
        db.query(ResultSubmission)
        .options(joinedload(ResultSubmission.table))
        .filter(ResultSubmission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Revision no encontrada")

    if next_status == "approved":
        previous_approved = (
            db.query(ResultSubmission)
            .filter(
                ResultSubmission.table_id == submission.table_id,
                ResultSubmission.status == "approved",
                ResultSubmission.id != submission.id,
            )
            .all()
        )
        for previous in previous_approved:
            previous.status = "replaced"
            previous.reviewed_at = datetime.utcnow()
            previous.reviewed_by = reviewer

    submission.status = next_status
    submission.reviewed_at = datetime.utcnow()
    submission.reviewed_by = reviewer
    db.commit()

    week_number = (
        db.query(Week.week_number)
        .join(MatchTable, MatchTable.week_id == Week.id)
        .filter(MatchTable.id == submission.table_id)
        .scalar()
    )
    return week_number


@app.post(APP_PREFIX + "/staff/reviews/{submission_id}/approve")
def approve_submission(submission_id: int, request: Request, db: Session = Depends(get_db)):
    _require_reviewer(request)
    week_number = _review_submission(db, submission_id, _current_username(request) or "staff", "approved")
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/staff/reviews", f"Resultado aprobado. Semana afectada: {week_number}."),
        status_code=303,
    )


@app.post(APP_PREFIX + "/staff/reviews/{submission_id}/reject")
def reject_submission(submission_id: int, request: Request, db: Session = Depends(get_db)):
    _require_reviewer(request)
    _review_submission(db, submission_id, _current_username(request) or "staff", "rejected")
    return RedirectResponse(
        redirect_with_message(f"{APP_PREFIX}/staff/reviews", "Resultado rechazado.", "error"),
        status_code=303,
    )
