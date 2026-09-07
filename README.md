
## Resident register

The read-only resident register is served by the React app at `http://localhost:5173/`. The editable collection desk remains available at `http://localhost:5173/admin`.

Resident PINs are four digits. Seeded and imported numeric flats use `1000 + flat number` (for example, flat `104` uses PIN `1104`). The API verifies the PIN before returning the register; resident requests do not expose payment or advance write actions.
# Coral Golf Green

Three-tier maintenance payment application:

- `client/`: React + Vite operator interface
- `server/`: Node.js + Express REST API
- `db/`: PostgreSQL schema

## Fee rule

The API applies late fees to unpaid maintenance dues from the rollout date onward. Each month's cutoff is its 10th day. With the default rollout date of `2026-08-10`:

- July 2026: no fee because it predates the rollout
- 10 August: no fee
- 11 August onward: `20` per calendar day for the August due
- 10 September: no fee
- 11 September onward: `20` per calendar day for the September due
- paid dues stop accumulating fees because fees are calculated only while the due is unpaid

Change `server/.env` if the intended year or amount is different:

```env
LATE_FEE_START_DATE=2026-08-10
LATE_FEE_PER_DAY=20
```

## Local setup

Prerequisites: Node.js 20+, npm, and PostgreSQL 14+.

```powershell
npm install
npm --prefix server install
npm --prefix client install
Copy-Item server/.env.example server/.env
npm --prefix server start
npm --prefix client run dev
```

Set `DATABASE_URL` in `server/.env` before starting the API. The UI runs at `http://localhost:5173`; the API runs at `http://localhost:4000`.

`db/schema.sql` is a destructive development reset script and is not a production migration. Do not run it against production. Apply an approved migration to the existing production database, keep the real data in PostgreSQL, and maintain a backup before structural changes. Each maintenance month is stored as a row so payments, adjustments, and late fees remain auditable.

The production API creates the current month's maintenance dues idempotently when the register loads. Existing paid and advance-paid months are preserved. PostgreSQL is the production source of truth; no CSV import or demo seed is required at runtime.

## API

- `GET /api/flats` returns active flats and unpaid dues with calculated fees.
- `GET /api/flats/:flatId/summary` returns the selected flat's totals.
- `POST /api/payments` accepts `{ flatId, dueIds, paymentMode, collectedBy }` and records the server-calculated total in one transaction.
- `GET /api/config` returns the active late-fee policy.
