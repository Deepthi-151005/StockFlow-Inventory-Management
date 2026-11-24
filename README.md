# StockFlow – SaaS Inventory Management

A multi-tenant inventory management application built for the recruitment assignment. Each account owns an organization and all business records are scoped to that organization.

## Features

### Assignment MVP
- Email/password signup and login
- Organization creation at signup
- Product create, read, update and delete
- SKU uniqueness within an organization
- Dashboard product count, units on hand and low-stock list
- Configurable default low-stock threshold
- Product search, filtering and pagination

### Extended features
- JWT authentication, bcrypt password hashing, Helmet security headers and API rate limiting
- Organization-level tenant isolation on every protected data query
- Stock adjustment workflow with reason/note and movement history
- Audit trail for key inventory actions
- Inventory valuation and category breakdown
- CSV import and export
- Responsive dashboard with charts
- Input validation and centralized API error handling

## Requirements
- Node.js 20+
- npm 10+

## Run locally

```bash
npm install
cp .env.example server/.env
```

Set a strong `JWT_SECRET` in `server/.env`, then:

```bash
npm run seed
npm run dev
```

Open http://localhost:5173

API runs at http://localhost:4000. Health check: http://localhost:4000/api/health

### Demo account
The seed script creates:
- Email: `demo@stockflow.local`
- Password: `StockFlow@123`
- Organization: `Demo Store`

Change the demo password before using this app beyond a local demonstration.

## Project structure

```
StockFlow/
  client/       React + Vite frontend
  server/       Express API and SQLite persistence
```

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create organization and owner |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Current account |
| GET | `/api/dashboard` | Dashboard metrics |
| GET/POST | `/api/products` | List / create products |
| GET/PUT/DELETE | `/api/products/:id` | Read / update / delete |
| POST | `/api/products/:id/adjust` | Adjust stock and record movement |
| GET | `/api/movements` | Stock movement history |
| GET/PUT | `/api/settings` | Organization settings |
| GET | `/api/reports/export` | Download products as CSV |
| POST | `/api/reports/import` | Import products from CSV |
| GET | `/api/audit` | Recent audit events |

All endpoints except auth and health require `Authorization: Bearer <token>`. Product and inventory endpoints always use the authenticated user's organization ID; clients cannot select another tenant.

## CSV format

Required columns: `name,sku,quantity`
Optional columns: `description,costPrice,sellingPrice,lowStockThreshold,category`

## Important production notes
This is a portfolio/recruitment project, not a production-certified SaaS. Before production deployment, use managed PostgreSQL, HTTPS, refresh-token rotation or secure server sessions, email verification/password reset, backups, centralized logging, stronger authorization policies, and security review. Configure `CLIENT_URL` and `JWT_SECRET` for the target environment.
