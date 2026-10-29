# W4Y Management Platform

A production-grade internal operations and project management system for W4Y.

## Core Features
- Role-based authentication (Admin, Accounts, Project Head, Employee) with JWT
- Attendance tracking with geofencing validation and Indian Standard Time (IST) locking
- Stage-based project management (Construction, Interior, Liaisoning)
- Real-time task board with threaded collaboration and comments
- Professional billing and invoicing module with GST breakdown and PDF export
- Comprehensive accounting ledgers, office expense tracking, and payroll calculation engine
- Analytical reporting with Excel and PDF telemetry exports

---

## Getting Started (Local Development)

### Prerequisites
- Node.js 18+ (tested with Node 20+)
- PostgreSQL 14+ (running locally or remote)

### 1. Environment Configuration

#### Backend Setup
```bash
cd server
cp .env.example .env
```
Edit `server/.env` with your PostgreSQL database credentials and JWT secret:
```ini
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://w4y_app:<password>@localhost:5432/w4y_dev
JWT_SECRET=<strong_random_secret_at_least_32_chars>
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
ADMIN_NAME=W4Y Admin
ADMIN_USERNAME=w4yadmin
ADMIN_PASSWORD=<admin_initial_password>
ADMIN_PHONE=7798647265
```

#### Frontend Setup
```bash
cd client
cp .env.example .env
```
Set the API target in `client/.env`:
```ini
VITE_API_URL=/api
```

---

### 2. Database Initialization & Seed
From the `server` directory:
```bash
cd server

# Install backend dependencies
npm install

# Build initial schema using psql (or run server startup auto-migrator)
psql -U w4y_app -d w4y_dev -f db/schema.sql

# Run database migrations
node utils/migrator.js

# Seed the initial admin account and system settings
npm run seed
```

---

### 3. Running the Applications

#### Start Backend API
```bash
cd server
npm run dev
# Server starts on http://localhost:3001
```

#### Start Frontend Client
```bash
cd client
npm install
npm run dev
# Client runs on http://localhost:5173
```

---

### 4. Production Build & Deployment

#### Frontend Build
```bash
cd client
npm run build
# Generates production assets in client/dist/
```

#### PM2 Cluster Execution
```bash
cd server
npm install --production
pm2 start ecosystem.config.js --env production
```

#### Nginx Reverse Proxy
Copy `scripts/nginx_w4y.conf` to `/etc/nginx/sites-available/w4y`:
```bash
sudo cp scripts/nginx_w4y.conf /etc/nginx/sites-available/w4y
sudo ln -s /etc/nginx/sites-available/w4y /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
