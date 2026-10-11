# ClinicFlow

Clinic operations platform: live patient queue, wait-time predictions,
appointment booking, doctor schedules, and patient self-service.

## Structure

| Folder | What it is |
|---|---|
| `clinicflow-server` | API: Express 5, TypeScript, PostgreSQL, Socket.IO |
| `clinicflow-web` | Web app: React 19, Vite, Tailwind (staff, doctor and patient portals) |
| `clinicflow-vision` | Prototype: YOLO person detection for waiting-room counts |
| `docs` | Testing notes |

## Running locally

Requirements: Node.js 20+, PostgreSQL.

```bash
# API (port 5000)
cd clinicflow-server
cp .env.example .env   # fill in the values
npm install
npm run dev

# Web app (port 5173)
cd clinicflow-web
cp .env.example .env
npm install
npm run dev
```

Database changes live in `clinicflow-server/sql/` and are applied in date order.

Never commit `.env` files. They hold database passwords, sign-in secrets and
SMS credentials.
