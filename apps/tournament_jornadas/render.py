from __future__ import annotations

from html import escape
from urllib.parse import quote_plus


def _page(
    title: str,
    body: str,
    *,
    flash: dict | None = None,
    current_role: str = "guest",
    current_username: str | None = None,
) -> str:
    flash_html = ""
    if flash:
        flash_type = escape(flash.get("type", "info"))
        flash_message = escape(flash.get("message", ""))
        flash_html = f'<div class="flash flash-{flash_type}">{flash_message}</div>'

    is_staff = current_role in {"moderator", "admin"}
    is_admin = current_role == "admin"
    staff_links = []
    if is_staff:
        staff_links.append('<a href="/staff/reviews">Revisiones</a>')
    if is_admin:
        staff_links.append('<a href="/admin/schedule">Jornadas</a>')
        staff_links.append('<a href="/admin/users">Usuarios</a>')

    auth_block = (
        f'<span class="staff-chip">Conectado como {escape(current_username or "staff")} · {escape(current_role)}</span>'
        '<form method="post" action="/staff/logout" class="inline-form">'
        '<button type="submit" class="link-button">Salir</button>'
        "</form>"
    ) if is_staff or current_role == "user" else '<a href="/staff/login">Acceso staff</a>'

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(title)} | Torneos de Discord de Zurgo</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
  <header class="site-header">
    <div>
      <span class="eyebrow">Mini app separada</span>
      <h1>Torneos de Discord de Zurgo</h1>
    </div>
    <nav class="site-nav">
      <a href="/">Inicio</a>
      <a href="/standings">Clasificacion</a>
      {"".join(staff_links)}
      {auth_block}
    </nav>
  </header>
  <main class="page-shell">
    {flash_html}
    {body}
  </main>
</body>
</html>"""


def render_home(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    tournament = context["tournament"]
    players = context["players"]
    weeks = context["weeks"]
    active_player_count = context["active_player_count"]
    pending_reviews = context["pending_reviews"]
    standings = context["standings"][:8]
    schedule_admin_link = context["schedule_admin_link"]

    players_html = "".join(
        f"""
        <tr>
          <td><a href="/players/{player['id']}">{escape(player['display_name'])}</a></td>
          <td><a href="{escape(player['deck_url'])}" target="_blank" rel="noreferrer">Abrir mazo</a></td>
          <td>{'Activo' if player['active'] else 'Inactivo'}</td>
        </tr>
        """
        for player in players
    ) or '<tr><td colspan="3">Todavia no hay jugadores inscritos.</td></tr>'

    weeks_html = "".join(
        f"""
        <li>
          <a href="/weeks/{week['week_number']}">Semana {week['week_number']}</a>
          <span>{week['table_count']} mesas</span>
        </li>
        """
        for week in weeks
    ) or "<li>Todavia no hay calendario generado.</li>"

    standings_html = "".join(
        f"""
        <tr>
          <td>{row['rank']}</td>
          <td><a href="/players/{row['player_id']}">{escape(row['display_name'])}</a></td>
          <td>{row['points']}</td>
          <td>{row['wins']}</td>
        </tr>
        """
        for row in standings
    ) or '<tr><td colspan="4">La clasificacion aparecera cuando se aprueben resultados.</td></tr>'

    schedule_panel = (
        f"""
        <article class="panel">
          <h3>Gestion de jornadas</h3>
          <p>La aleatoriedad y generacion de semanas esta apartada en un panel solo visible para administradores.</p>
          <a class="button-link" href="{schedule_admin_link}">Abrir panel de jornadas</a>
        </article>
        """
        if schedule_admin_link
        else """
        <article class="panel">
          <h3>Gestion de jornadas</h3>
          <p>La generacion de semanas esta reservada a administradores. El resto de la app sigue siendo visible para jugadores y staff.</p>
        </article>
        """
    )

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Torneo configurable</span>
        <h2>{escape(tournament['name'])}</h2>
        <p>
          Genera jornadas de 4 jugadores por mesa sin repetir rivales entre semanas,
          registra mazos y valida resultados antes de mover la clasificacion.
        </p>
      </div>
      <div class="hero-stats">
        <div><span>Jugadores activos</span><strong>{active_player_count}</strong></div>
        <div><span>Semanas generadas</span><strong>{tournament['generated_weeks']}</strong></div>
        <div><span>Pendientes</span><strong>{pending_reviews}</strong></div>
      </div>
    </section>

    <section class="grid two-columns">
      <article class="panel">
        <h3>Inscripcion rapida</h3>
        <form method="post" action="/players/register" class="stack-form">
          <label>Nombre
            <input type="text" name="display_name" maxlength="120" required />
          </label>
          <label>URL del mazo
            <input type="url" name="deck_url" maxlength="500" required />
          </label>
          <button type="submit">Inscribir jugador</button>
        </form>
      </article>

      <article class="panel">
        <h3>Importar lista</h3>
        <p>Formato recomendado: <code>Nombre,https://url-del-mazo</code> una linea por jugador.</p>
        <form method="post" action="/players/import" class="stack-form">
          <label>Lista de jugadores
            <textarea name="player_list" rows="8" placeholder="Jugador 1,https://mazo1.com&#10;Jugador 2,https://mazo2.com"></textarea>
          </label>
          <button type="submit">Importar jugadores</button>
        </form>
      </article>
    </section>

    <section class="grid two-columns">
      {schedule_panel}

      <article class="panel">
        <h3>Semanas</h3>
        <ul class="link-list">{weeks_html}</ul>
      </article>
    </section>

    <section class="grid two-columns">
      <article class="panel">
        <h3>Jugadores</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Jugador</th><th>Mazo</th><th>Estado</th></tr></thead>
            <tbody>{players_html}</tbody>
          </table>
        </div>
      </article>

      <article class="panel">
        <h3>Top clasificacion</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>1os</th></tr></thead>
            <tbody>{standings_html}</tbody>
          </table>
        </div>
      </article>
    </section>
    """
    return _page("Inicio", body, flash=flash, current_role=current_role, current_username=current_username)


def render_schedule_admin(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    tournament = context["tournament"]
    active_player_count = context["active_player_count"]
    players = context["players"]
    players_html = "".join(
        f"<li><strong>{escape(player['display_name'])}</strong> <a href=\"{escape(player['deck_url'])}\" target=\"_blank\" rel=\"noreferrer\">Mazo</a></li>"
        for player in players
    ) or "<li>No hay jugadores activos.</li>"

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Solo administradores</span>
        <h2>Panel de jornadas</h2>
        <p>Desde aqui se ejecuta la aleatoriedad y la generacion de semanas. Moderadores y usuarios no ven este panel.</p>
      </div>
      <div class="hero-stats">
        <div><span>Jugadores activos</span><strong>{active_player_count}</strong></div>
        <div><span>Semanas generadas</span><strong>{tournament['generated_weeks']}</strong></div>
      </div>
    </section>

    <section class="grid two-columns">
      <article class="panel">
        <h3>Generar calendario</h3>
        <p>El sistema intenta crear tantas semanas como pidas sin repetir rivales. Formato actual: mesas de 4 y jugadores activos multiplo de 4.</p>
        <form method="post" action="/admin/schedule/generate" class="stack-form">
          <label>Nombre del torneo
            <input type="text" name="name" value="{escape(tournament['name'])}" maxlength="120" required />
          </label>
          <label>Semanas deseadas
            <input type="number" name="requested_weeks" min="1" max="20" value="{tournament['requested_weeks']}" required />
          </label>
          <button type="submit">Generar jornadas</button>
        </form>
      </article>

      <article class="panel">
        <h3>Jugadores activos para el sorteo</h3>
        <ul class="opponent-list">{players_html}</ul>
      </article>
    </section>
    """
    return _page("Panel de jornadas", body, flash=flash, current_role=current_role, current_username=current_username)


def render_player_page(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    player = context["player"]
    rounds = context["rounds"]
    rounds_html = "".join(
        f"""
        <article class="panel round-card">
          <div class="round-card-top">
            <div>
              <span class="eyebrow">Semana {round_info['week_number']}</span>
              <h3>Mesa {round_info['table_number']}</h3>
            </div>
            <a href="/weeks/{round_info['week_number']}">Ver semana</a>
          </div>
          <ul class="opponent-list">
            {''.join(
                f'<li><strong>{escape(opponent["display_name"])}</strong> <a href="{escape(opponent["deck_url"])}" target="_blank" rel="noreferrer">Mazo</a></li>'
                for opponent in round_info['opponents']
            ) or '<li>Sin rivales cargados.</li>'}
          </ul>
        </article>
        """
        for round_info in rounds
    ) or '<div class="panel">Este jugador todavia no tiene semanas asignadas.</div>'

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Ficha de jugador</span>
        <h2>{escape(player['display_name'])}</h2>
        <p>Esta pagina sirve como vista rapida del usuario con su mazo y sus contrincantes por semana.</p>
      </div>
      <div class="hero-actions">
        <a class="button-link" href="{escape(player['deck_url'])}" target="_blank" rel="noreferrer">Abrir mazo</a>
        <a class="button-link button-link-soft" href="/">Volver al inicio</a>
      </div>
    </section>
    <section class="grid one-column">
      {rounds_html}
    </section>
    """
    return _page(f"Jugador {player['display_name']}", body, flash=flash, current_role=current_role, current_username=current_username)


def render_week_page(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    week = context["week"]
    tables = context["tables"]
    tables_html = "".join(
        f"""
        <article class="panel">
          <div class="round-card-top">
            <div>
              <span class="eyebrow">Mesa {table['table_number']}</span>
              <h3>{table['status_label']}</h3>
            </div>
            <a href="/weeks/{week['week_number']}/tables/{table['table_number']}/report">Reportar resultado</a>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Jugador</th><th>Mazo</th></tr></thead>
              <tbody>
                {''.join(
                    f'<tr><td><a href="/players/{seat["player_id"]}">{escape(seat["display_name"])}</a></td><td><a href="{escape(seat["deck_url"])}" target="_blank" rel="noreferrer">Abrir</a></td></tr>'
                    for seat in table['seats']
                )}
              </tbody>
            </table>
          </div>
        </article>
        """
        for table in tables
    ) or '<div class="panel">No hay mesas en esta semana.</div>'

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Semana {week['week_number']}</span>
        <h2>Jornada completa</h2>
        <p>Consulta todas las mesas, mazos y acceso al formulario de resultados de esta semana.</p>
      </div>
      <div class="hero-actions">
        <a class="button-link button-link-soft" href="/">Volver al inicio</a>
      </div>
    </section>
    <section class="grid one-column">
      {tables_html}
    </section>
    """
    return _page(f"Semana {week['week_number']}", body, flash=flash, current_role=current_role, current_username=current_username)


def render_standings_page(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    standings = context["standings"]
    rows_html = "".join(
        f"""
        <tr>
          <td>{row['rank']}</td>
          <td><a href="/players/{row['player_id']}">{escape(row['display_name'])}</a></td>
          <td>{row['points']}</td>
          <td>{row['wins']}</td>
          <td>{row['seconds']}</td>
          <td>{row['thirds']}</td>
          <td>{row['fourths']}</td>
          <td>{row['zeroes']}</td>
        </tr>
        """
        for row in standings
    ) or '<tr><td colspan="8">Todavia no hay resultados aprobados.</td></tr>'

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Ranking</span>
        <h2>Clasificacion general</h2>
        <p>La tabla se actualiza solo con resultados aprobados por staff autorizado.</p>
      </div>
    </section>
    <article class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Puntos</th>
              <th>1os</th>
              <th>2os</th>
              <th>3os</th>
              <th>4os</th>
              <th>0 pts</th>
            </tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
      </div>
    </article>
    """
    return _page("Clasificacion", body, flash=flash, current_role=current_role, current_username=current_username)


def render_report_page(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    week = context["week"]
    table = context["table"]
    seats = context["seats"]

    player_blocks = "".join(
        f"""
        <div class="result-entry-card">
          <h4>{escape(seat['display_name'])}</h4>
          <label>Puesto
            <select name="placement_{seat['player_id']}" required>
              <option value="1">1o</option>
              <option value="2">2o</option>
              <option value="3">3o</option>
              <option value="4">4o</option>
            </select>
          </label>
          <label>Estado
            <select name="result_type_{seat['player_id']}">
              <option value="normal">Normal</option>
              <option value="surrender">Se ha rendido</option>
              <option value="cheating">Trampas detectadas</option>
            </select>
          </label>
        </div>
        """
        for seat in seats
    )

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Semana {week['week_number']}</span>
        <h2>Resultados de mesa {table['table_number']}</h2>
        <p>Se envia una propuesta de resultado. No suma puntos hasta que la valide un moderador o administrador.</p>
      </div>
    </section>

    <article class="panel">
      <form method="post" action="/weeks/{week['week_number']}/tables/{table['table_number']}/report" class="stack-form">
        <label>Enviado por
          <input type="text" name="submitted_by" maxlength="120" required />
        </label>
        <label>Notas
          <textarea name="notes" rows="3" placeholder="Incidencias, aclaraciones o contexto adicional"></textarea>
        </label>
        <div class="grid two-columns">{player_blocks}</div>
        <button type="submit">Enviar resultado para revision</button>
      </form>
    </article>
    """
    return _page(f"Reportar mesa {table['table_number']}", body, flash=flash, current_role=current_role, current_username=current_username)


def render_staff_login(*, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    body = """
    <article class="panel narrow-panel">
      <h2>Acceso staff</h2>
      <p>Moderadores y administradores validan resultados. Los administradores, ademas, gestionan jornadas y usuarios.</p>
      <form method="post" action="/staff/login" class="stack-form">
        <label>Usuario
          <input type="text" name="username" maxlength="120" required />
        </label>
        <label>Contrasena
          <input type="password" name="password" maxlength="120" required />
        </label>
        <button type="submit">Entrar</button>
      </form>
    </article>
    """
    return _page("Acceso staff", body, flash=flash, current_role=current_role, current_username=current_username)


def render_staff_reviews(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    submissions = context["submissions"]
    submissions_html = "".join(
        f"""
        <article class="panel">
          <div class="round-card-top">
            <div>
              <span class="eyebrow">Semana {submission['week_number']} · Mesa {submission['table_number']}</span>
              <h3>Enviado por {escape(submission['submitted_by'])}</h3>
            </div>
            <span class="status-badge status-{escape(submission['status'])}">{escape(submission['status_label'])}</span>
          </div>
          <p>{escape(submission['notes'] or 'Sin notas.')}</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Jugador</th><th>Puesto</th><th>Estado</th><th>Puntos</th></tr></thead>
              <tbody>
                {''.join(
                    f'<tr><td>{escape(entry["display_name"])}</td><td>{entry["placement"]}o</td><td>{escape(entry["result_type_label"])}</td><td>{entry["points_awarded"]}</td></tr>'
                    for entry in submission['entries']
                )}
              </tbody>
            </table>
          </div>
          <div class="inline-actions">
            <form method="post" action="/staff/reviews/{submission['id']}/approve">
              <button type="submit">Aprobar</button>
            </form>
            <form method="post" action="/staff/reviews/{submission['id']}/reject">
              <button type="submit" class="danger-button">Rechazar</button>
            </form>
          </div>
        </article>
        """
        for submission in submissions
    ) or '<div class="panel">No hay resultados pendientes ahora mismo.</div>'

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Moderacion</span>
        <h2>Resultados pendientes</h2>
        <p>Aqui validas o rechazas lo que han enviado los jugadores antes de actualizar la clasificacion.</p>
      </div>
    </section>
    <section class="grid one-column">
      {submissions_html}
    </section>
    """
    return _page("Revisiones staff", body, flash=flash, current_role=current_role, current_username=current_username)


def render_staff_users(context: dict, *, flash: dict | None = None, current_role: str = "guest", current_username: str | None = None) -> str:
    users = context["users"]
    users_html = "".join(
        f"""
        <tr>
          <td>{escape(user['username'])}</td>
          <td>{escape(user['role'])}</td>
          <td>{'Activo' if user['active'] else 'Inactivo'}</td>
          <td>{escape(user['created_at'])}</td>
        </tr>
        """
        for user in users
    ) or '<tr><td colspan="4">No hay usuarios staff todavia.</td></tr>'

    body = f"""
    <section class="hero panel">
      <div>
        <span class="eyebrow">Solo administradores</span>
        <h2>Usuarios y roles</h2>
        <p>Crea cuentas con rol <code>admin</code>, <code>moderator</code> o <code>user</code>.</p>
      </div>
    </section>

    <section class="grid two-columns">
      <article class="panel">
        <h3>Crear usuario</h3>
        <form method="post" action="/admin/users" class="stack-form">
          <label>Usuario
            <input type="text" name="username" maxlength="120" required />
          </label>
          <label>Contrasena
            <input type="password" name="password" maxlength="120" required />
          </label>
          <label>Rol
            <select name="role" required>
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button type="submit">Crear cuenta</button>
        </form>
      </article>

      <article class="panel">
        <h3>Cuentas existentes</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Alta</th></tr></thead>
            <tbody>{users_html}</tbody>
          </table>
        </div>
      </article>
    </section>
    """
    return _page("Usuarios staff", body, flash=flash, current_role=current_role, current_username=current_username)


def redirect_with_message(path: str, message: str, level: str = "success") -> str:
    return f"{path}?flash_type={quote_plus(level)}&flash_message={quote_plus(message)}"
