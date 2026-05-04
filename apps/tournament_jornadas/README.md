# Torneos de Discord de Zurgo

Mini app separada del proyecto principal para organizar jornadas con:

- inscripcion manual o importacion por lista
- generacion de semanas con mesas de 4 sin repetir rivales
- ficha publica de jugador con URL de mazo
- vista por semana
- clasificacion por puntos
- envio de resultados y validacion admin

## Reglas actuales

- formato fijo de 4 jugadores por mesa
- requiere numero de jugadores activos multiplo de 4
- puntos:
  - 1º: 4
  - 2º: 3
  - 3º: 2
  - 4º: 1
  - rendicion o trampas: 0
- solo los resultados aprobados por admin suman en la clasificacion

## Arranque

Desde la carpeta del mini proyecto:

```powershell
cd C:\Users\jsangar\tgc\apps\tournament_jornadas
..\..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8010
```

Abre:

```text
http://127.0.0.1:8010/
```

## Admin

Por defecto:

- usuario: `admin`
- contrasena: `admin123`

Puedes cambiarla con:

```powershell
$env:TOURNAMENT_ADMIN_PASSWORD="tu_clave"
```

## Despliegue en Vercel como proyecto aparte

Este mini proyecto esta pensado para desplegarse como **otro proyecto de Vercel**, con su propia URL.

Lo importante:

- usa `apps/tournament_jornadas` como `Root Directory`
- **no uses SQLite en produccion en Vercel** si quieres persistencia real
- usa una base Postgres externa con `TOURNAMENT_DATABASE_URL`

Variables recomendadas:

```text
TOURNAMENT_DATABASE_URL=postgresql://...
TOURNAMENT_SESSION_SECRET=una_clave_larga_y_privada
TOURNAMENT_ADMIN_PASSWORD=tu_clave_admin
```
