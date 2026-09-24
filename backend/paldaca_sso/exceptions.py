class PortalUnauthorized(Exception):
    """El Portal respondió 401/403: negativa autoritativa, sin gracia."""


class PortalUnavailable(Exception):
    """
    El Portal no dio una respuesta de la que se pueda concluir nada: timeout,
    5xx, DNS, 3xx, o 200 con un cuerpo que no es el JSON esperado (el Portal
    tiene `DEBUG=True` hardcodeado — ver `IA_CONTEXT.md` §13.2 — así que una
    excepción ahí puede devolver un traceback HTML con 500).

    Nunca se interpreta como "usuario no autenticado": dispara el modo
    gracia, no un cierre de sesión.
    """
