"""
Sirve el shell de la SPA (React) compilada.

Deliberadamente NO gateado por `PaldacaSsoBootstrapMiddleware` (ver
`paldaca_sso/conf.py::gated_prefixes`): el documento tiene que cargar siempre
(200), sea cual sea el estado de sesión — es el propio React quien decide,
llamando a `GET /api/auth/me/`, si pinta la app, una pantalla de "sesión
expirada" o un redirect top-level al login del Portal. Cortar la carga del
documento aquí dejaría a un usuario sin sesión viendo una página en blanco
del navegador en vez de la UI de la propia SPA.

`PaldacaEmbedMiddleware` (que corre antes, ver MIDDLEWARE) ya puso la cabecera
CSP `frame-ancestors` en la respuesta por el simple hecho de pasar por él —
no hace falta nada especial aquí para el embed.
"""

from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.utils.html import escape

_DIST_INDEX = Path(settings.BASE_DIR).parent / "frontend" / "dist" / "index.html"

_DEV_PLACEHOLDER = """<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Planificación</title></head>
<body style="font-family: system-ui; padding: 2rem; max-width: 40rem; margin: auto;">
<h1>Planificación — backend Django</h1>
<p>Este backend es API-only. En desarrollo, el frontend React corre en su
propio servidor Vite (ver <code>frontend/</code>) — abrí esa URL en vez de
esta.</p>
<p>Si estás probando el build de producción, corré
<code>npm run build</code> en <code>frontend/</code> primero: este mensaje
aparece porque <code>frontend/dist/index.html</code> todavía no existe.</p>
</body></html>"""


def con_config(html: str) -> str:
    """Escribe en el documento la URL del Portal de ESTE despliegue.

    El build de Vite trae la de `.env.production` (https://cpaldaca.com); si
    la SPA la usara como `targetOrigin` en la Suite local, el navegador
    descartaría los `postMessage` y el Portal nunca recibiría `ready`. Con la
    meta, el origen sale de `settings.PALDACA_PORTAL_URL` —el mismo de
    `frame-ancestors`—, como en los satélites Django (CONTRATO_EMBED.md)."""
    meta = f'<meta name="paldaca-portal-url" content="{escape(settings.PALDACA_PORTAL_URL)}">'
    return html.replace("</head>", f"{meta}</head>", 1)


def spa_shell(request, *args, **kwargs):
    if _DIST_INDEX.exists():
        return HttpResponse(con_config(_DIST_INDEX.read_text(encoding="utf-8")))
    return HttpResponse(_DEV_PLACEHOLDER, status=200 if settings.DEBUG else 501)
