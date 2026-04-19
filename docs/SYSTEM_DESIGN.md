# BudgetBukas — System Design Document

## 1. Overview

BudgetBukas is a financial transparency system for the JPCS organization at BatStateU Lipa. It solves the problem: *"Saan napupunta ang pera ng org?"*

### Users
- **Officers** (Treasurer/President): Full CRUD access to transactions, receipts, and reports
- **Members**: Read-only access to all financial data for transparency

---

## 2. Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     Frontend     │────▶│   Backend API    │────▶│   MySQL (3NF)    │
│   Static SPA     │◀────│   Express.js     │◀────│   6 Tables       │
│   HTML/CSS/JS    │     │   JWT + RBAC     │     │   Views/Triggers │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                               │
                         ┌─────┴─────┐
                         │ Tesseract │
                         │    OCR    │
                         └───────────┘
```

### Layer Responsibilities
| Layer    | Responsibility                                    |
|----------|--------------------------------------------------|
| Frontend | UI rendering, SPA routing, Chart.js, theme mgmt |
| Backend  | Auth, CRUD, OCR, chatbot NLP, file uploads       |
| Database | Data storage, integrity, audit logging           |

---

## 3. Database Design (3NF)

### Entity Relationship
```
users ──┐
        ├──▶ transactions ──┬──▶ income
        │                   └──▶ expenses ──▶ receipts
        └──────────────────────▶ audit_log
```

### Tables
| Table        | Purpose                                   |
|-------------|-------------------------------------------|
| users        | Authentication, roles                     |
| transactions | Parent record (type, amount, date, user)  |
| income       | Child of transactions (source field)      |
| expenses     | Child of transactions (category, desc)    |
| receipts     | Linked to expenses, stores OCR text       |
| audit_log    | Immutable log of all transaction changes  |

### Database Objects
- **View**: `total_balance` — auto-calculates remaining funds
- **Triggers**: After INSERT/UPDATE/DELETE on transactions → audit_log
- **Stored Procedures**: `monthly_report()`, `category_breakdown()`

---

## 4. Authentication & Security

- **Password Hashing**: bcrypt (12 salt rounds)
- **Token Auth**: JWT with 24h expiry
- **RBAC**: Middleware checks `user.role === 'officer'` for write ops
- **Input Validation**: express-validator on all endpoints
- **File Security**: Multer with type/size restrictions (5MB, images only)
- **HTTP Security**: Helmet.js headers + CORS configuration

---

## 5. AI Chatbot Design

The chatbot uses **local pattern-matching** (no external LLM API):

1. User input → regex pattern matching
2. Matched pattern → dynamic SQL query construction
3. SQL execution → formatted response with emoji

### Supported Query Types (12+)
- Balance queries, income/expense totals
- Monthly reports, category breakdowns
- Date-range filtering, top expenses
- Filipino language support (e.g., "magkano gastos")
- Help/greeting handlers

### AI Feel (UI)
- Glowing gradient border animation
- Typing indicator with bouncing dots
- Suggestion pills for quick queries
- Pulse animation on bot avatar

---

## 6. OCR Pipeline

```
Image Upload → Multer (validate) → Tesseract.js (extract text) → Regex Parse → Auto-fill Form
```

Extracted fields: total amount, date, line items (best-effort)
Always allows manual correction of OCR results.

---

## 7. Design System

| Token          | Value                         |
|---------------|-------------------------------|
| Primary       | Gold `#D4AF37`                |
| Secondary     | Brown `#5C4033`               |
| Background    | Dark `#0F0F0F` / Light `#F5F3EE` |
| Font Primary  | Inter                         |
| Font Display  | Outfit                        |
| Border Radius | 4–32px scale                  |
| Shadows       | 4-level depth system          |

Supports dark mode (default) and light mode via CSS custom properties.
