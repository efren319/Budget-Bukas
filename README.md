# 💰 BudgetBukas

**Financial Transparency System for JPCS — BatStateU Lipa**

> "Saan napupunta ang pera ng org?"

BudgetBukas is a production-quality web-based financial transparency system built for the Junior Philippine Computer Society (JPCS) at Batangas State University – Lipa Campus. It enables officers to manage organizational finances while providing members with transparent, read-only access to all financial data.

---

## 🏗️ Architecture

```
project-root/
├── frontend/          # Static SPA (HTML/CSS/JS)
│   ├── public/        # HTML pages + static assets
│   └── src/           # CSS stylesheets + JS modules
├── backend/           # Node.js + Express API
│   ├── src/           # Controllers, routes, middleware, utils
│   └── uploads/       # Receipt image storage
├── database/          # MySQL schema, migrations, seeds
├── docs/              # API documentation + system design
└── tests/             # Test suites
```

## ✨ Features

- **Role-Based Access** — Officers (CRUD) vs Members (read-only)
- **Dashboard Analytics** — Hero stats, Chart.js graphs, category breakdown
- **CRUD Transactions** — Income & expense management with filtering/sorting
- **Receipt OCR** — Tesseract.js scans receipts, auto-fills form fields
- **AI Chatbot** — Pattern-matching NL→SQL engine (no external API)
- **Dark/Light Mode** — Full theme system with CSS custom properties
- **Responsive Design** — Mobile-first with sidebar drawer

## 🛠️ Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | HTML, CSS, Vanilla JavaScript       |
| Backend    | Node.js, Express                    |
| Database   | MySQL (3NF normalized)              |
| OCR        | Tesseract.js                        |
| Charts     | Chart.js                            |
| Auth       | JWT + bcrypt                        |
| Icons      | Lucide Icons                        |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0+

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/budgetbukas.git
cd budgetbukas
npm run install:backend
```

### 2. Database Setup
```bash
mysql -u root -p < database/schema.sql
```

### 3. Configure Environment
Edit `.env` at project root:
```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=budgetbukas
JWT_SECRET=change_this_to_a_random_string
```

### 4. Run
```bash
npm run dev
```

Open **http://localhost:3000** — Register as **Officer** first for full access.

## 🌐 Deployment

### Vercel
The project includes a `vercel.json` configuration. Set environment variables in the Vercel dashboard.

### Cloud Database
Update `.env` for your cloud MySQL provider:
```env
DB_HOST=your-cloud-host.example.com
DB_USER=cloud_user
DB_PASS=cloud_password
DB_SSL=true
```

Supported: PlanetScale, Railway MySQL, Aiven, Amazon RDS

## 📖 Documentation

- [API Reference](docs/API.md)
- [System Design](docs/SYSTEM_DESIGN.md)

## 📄 License

MIT — JPCS BatStateU Lipa
