# 💸 BillBuddy

Your friendly bill manager — track bills, get smart suggestions, manage reminders, and see spending breakdowns.

## Features

- **Dashboard** — Overview of monthly bills, paid/remaining totals, progress bar
- **Calendar** — Monthly view with color-coded bill due dates
- **AI Insights** — Smart money-saving suggestions based on your bills
- **Spending Charts** — Donut chart + bar breakdown by category
- **Payment History** — Full log of past payments with on-time/late tracking
- **Reminders** — Set notification schedules per bill (day-of, 1 day, 3 days, 1 week)
- **Dark Mode** — Toggle between light and dark themes

## Tech Stack

- **Frontend:** React 18
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Deployment:** Railway

## Local Development

### 1. Prerequisites
- Node.js 18+
- PostgreSQL (local or Railway)

### 2. Clone and install

```bash
git clone <your-repo-url>
cd billbuddy
npm run install:all
```

### 3. Set up environment variables

```bash
cp server/.env.example server/.env
# Edit server/.env with your DATABASE_URL
```

### 4. Initialize the database

```bash
cd server
npm run db:init
```

### 5. Run in development

```bash
# From root directory
npm run dev
```

This starts both the Express server (port 3001) and React dev server (port 3000) concurrently.

## Deploy to Railway

### 1. Create a new project on [Railway](https://railway.app)

### 2. Add a PostgreSQL database
- Click **"+ New"** → **"Database"** → **"PostgreSQL"**
- Railway automatically sets the `DATABASE_URL` environment variable

### 3. Deploy the app
- Connect your GitHub repo, or use Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Deploy
railway up
```

### 4. Set environment variables
Railway auto-provides `DATABASE_URL` and `PORT`. Just add:
- `NODE_ENV` = `production`

### 5. Generate a domain
- Go to your service → **Settings** → **Networking** → **Generate Domain**

The database tables are auto-created on first startup.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bills` | Get all bills |
| POST | `/api/bills` | Create a new bill |
| PATCH | `/api/bills/:id` | Update a bill |
| DELETE | `/api/bills/:id` | Delete a bill |
| POST | `/api/bills/reset-month` | Reset all bills to unpaid |
| GET | `/api/history` | Get payment history |
| POST | `/api/history` | Record a payment |
| GET | `/api/history/months` | Get distinct months |
| GET | `/api/history/stats` | Get summary stats |
| GET | `/api/health` | Health check |

## License

MIT
