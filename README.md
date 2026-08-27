# SSA Smart Claims — Case Bundle App

A modern two-tab dashboard for DDS examiners and SSA leadership, built on the
**SSA Smart Claims** data product (DataOS/Vulcan semantic layer on Snowflake).
Same design language, theming and REST-over-semantic-layer integration as the
`customer-health-app`.

- **Tab 1 — Overview:** portfolio settlement outcomes (settled % / not-settled %),
  pipeline maturity by bundle stage, program & state breakdowns, evidence intake /
  IDP trust, and claims needing attention.
- **Tab 2 — Claimant Bundle Status:** every claimant (with **governed, masked PII**)
  and where their evidence bundle sits on the 0–100 day journey. Open any claimant to
  see the six-stage **case-bundle board** (received vs pending documents per stage) and
  the journey **timeline** — a modern rebuild of the old "Case Bundle Processing System".

## Stack

- **Frontend:** React + Vite + TypeScript, Tailwind, Recharts, React Query. IBM Plex fonts, dark/light.
- **Backend:** Node.js + Express + TypeScript. Reads the semantic layer via the async REST query API.
- **Data:** the SSA Smart Claims semantic models — `CLAIM_LIFECYCLE`, `CLAIMANT` (PII, masked),
  `BUNDLE_CHECKLIST`, `EVIDENCE`.

## Data flow

```
Semantic layer (governed: masking + row-level security)
      │   POST /api/v1/query/semantic/rest  → poll statement → fetch result
      ▼
  SsaAdapter (queries + shaping, cached)
      │
      ▼
  Express API  ──►  /api/overview · /api/claimants · /api/claimants/:id
      │
      ▼
  React dashboard (Overview · Claimant Bundle Status · Journey)
```

Governance (SSN → hash, name → redacted, email → domain-only, phone → masked, and
row-level security by state) is enforced **once** in the semantic layer, so whatever
the app receives is already governed for the token's user group.

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then paste your DataOS token into SEMANTIC_API_TOKEN
npm run probe             # optional: validate the semantic queries
npm run dev               # API on http://localhost:4100
```

`.env` already points `SEMANTIC_API_URL` at the SSA data product:
`https://leidos-sandbox.instance.dataos.cloud/vulcan/tenants/onboarding/data-products/onboarding-ssa-smart-claims-two`.
You only need to add `SEMANTIC_API_TOKEN`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # app on http://localhost:5273 (proxies /api to :4100)
```

Open http://localhost:5273.

## API

| Endpoint | Description |
|---|---|
| `GET /api/overview` | Portfolio KPIs, settlement/denial rates, stage pipeline, program & state outcomes, evidence intake, attention list |
| `GET /api/claimants` | Filterable/sortable claimants with masked PII (`status`, `stage`, `program`, `state`, `search`, `sort`) |
| `GET /api/claimants/filters` | Available filter values |
| `GET /api/claimants/:claimId` | Journey detail: case-bundle board, timeline, claimant record, determination, evidence events |
| `GET /api/health` | Liveness + whether a token is configured |
