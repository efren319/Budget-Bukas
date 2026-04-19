# BudgetBukas API Reference

## Base URL
```
Development: http://localhost:3000/api
Production:  https://your-domain.vercel.app/api
```

## Authentication

All protected routes require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

---

## Auth Endpoints

### POST `/api/auth/register`
Register a new user.

**Body:**
```json
{
  "name": "Juan Dela Cruz",
  "email": "juan@batstate-u.edu.ph",
  "password": "secure123",
  "role": "member"
}
```
- `role`: `"member"` or `"officer"`

**Response:** `201 Created`
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": { "id": 1, "name": "Juan Dela Cruz", "role": "member" }
}
```

### POST `/api/auth/login`
Authenticate and receive a JWT token.

**Body:**
```json
{
  "email": "juan@batstate-u.edu.ph",
  "password": "secure123"
}
```

**Response:** `200 OK` — same format as register

### PUT `/api/auth/profile` 🔒
Update current user's profile.

### PUT `/api/auth/password` 🔒
Change current user's password.

---

## Transaction Endpoints

### GET `/api/transactions` 🔒
List transactions with filtering and pagination.

**Query Parameters:**
| Param     | Type   | Description                    |
|-----------|--------|-------------------------------|
| page      | number | Page number (default: 1)       |
| limit     | number | Items per page (default: 20)   |
| type      | string | `"income"` or `"expense"`      |
| sort      | string | `"date"` or `"amount"`         |
| order     | string | `"asc"` or `"desc"`            |
| startDate | string | Filter start (YYYY-MM-DD)      |
| endDate   | string | Filter end (YYYY-MM-DD)        |
| search    | string | Search term                    |

### POST `/api/transactions` 🔒 👮 Officer only
Create a new transaction.

**Body (Income):**
```json
{
  "type": "income",
  "amount": 5000.00,
  "date": "2024-01-15",
  "source": "Membership Fees"
}
```

**Body (Expense):**
```json
{
  "type": "expense",
  "amount": 1500.00,
  "date": "2024-01-16",
  "category": "Food & Beverages",
  "description": "Snacks for general assembly"
}
```

### GET `/api/transactions/:id` 🔒
Get a single transaction.

### PUT `/api/transactions/:id` 🔒 👮
Update a transaction.

### DELETE `/api/transactions/:id` 🔒 👮
Delete a transaction and its child records.

### GET `/api/transactions/dashboard/stats` 🔒
Dashboard summary: balance, recent activity, category breakdown.

### GET `/api/transactions/dashboard/chart?period=week` 🔒
Chart data for income vs expenses over time.
- `period`: `"week"`, `"month"`, or `"year"`

---

## Receipt Endpoints

### POST `/api/receipts/upload` 🔒 👮
Upload a receipt image and run OCR.
- Content-Type: `multipart/form-data`
- Field: `receipt` (image file, max 5MB)

### POST `/api/receipts/save` 🔒 👮
Save a receipt record linked to an expense.

### GET `/api/receipts` 🔒
List all receipts with expense details.

### GET `/api/receipts/:id` 🔒
Get single receipt details.

### GET `/api/receipts/image/:filename` 🔒
Serve a receipt image file.

---

## Chatbot Endpoint

### POST `/api/chatbot/query` 🔒
Send a natural language question about finances.

**Body:**
```json
{ "message": "What is the total balance?" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "type": "balance",
    "response": "💰 **Organization Balance**\n\nTotal Income: ₱15,000.00\nTotal Expenses: ₱8,500.00\n\n**Remaining: ₱6,500.00**",
    "suggestions": ["Expenses this month", "Top expenses"]
  }
}
```

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Error description"
}
```

| Status | Meaning                |
|--------|------------------------|
| 400    | Bad request / validation error |
| 401    | Unauthorized (missing/invalid token) |
| 403    | Forbidden (insufficient role) |
| 404    | Resource not found |
| 500    | Internal server error |

---

🔒 = Requires authentication
👮 = Officer role required
