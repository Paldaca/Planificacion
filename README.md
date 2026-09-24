# Planificacion

Planificación PALDACA: satélite **federado** de PALDACA Suite (React + Django).

- Backend Django API-only en `backend/` (puerto dev **8007**), BD y `SECRET_KEY` propias.
- Frontend React + Vite en `frontend/` (puerto dev **5181**); en el iframe del
  Portal se sirve el build (`frontend/dist`) desde Django.
- Identidad por SSO federado (`backend/paldaca_sso/`): cookie-forwarding contra
  `GET /api/auth/me/` del Portal. Código de módulo: `planificacion`.

Diseño funcional y plan por fases: [`docs/plan-modulo-planificacion.md`](docs/plan-modulo-planificacion.md).

Contrato: `Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md` y
[`docs/guia-integracion-programas-satelite.md`](docs/guia-integracion-programas-satelite.md).

## Arranque en local

Desde el repo del Portal (prepara venv, `backend/.env`, migraciones y build):

```powershell
.\iniciar.ps1 -Modo planificacion
```

A mano:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy backend\.env.example backend\.env   # y poner PALDACA_SSO_ENABLED=true
cd backend
..\venv\Scripts\python.exe manage.py migrate
..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8007
cd ..\frontend
npm install
npm run dev      # http://localhost:5181
```

Usar siempre `localhost` (no `127.0.0.1`) en el navegador: la cookie del
Portal es host-only en local.
