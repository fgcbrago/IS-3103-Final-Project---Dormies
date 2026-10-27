# Dormies - Dormitory Management System

Web based dormitory management system (React frontend + Express.js REST API + Prisma ORM + MySQL database),
built from the "Dormies" system analysis paper. Three roles: **Administrator**, **Staff** and **Resident**.

## Folders

```
dormies/
  backend/    REST API (Express.js)  routes -> services -> Prisma -> MySQL, JWT login, role checks
    prisma/schema.prisma             the tables (3NF), same as the data dictionary in the paper
  frontend/   React + Vite app       pages, components, layouts, context (same setup as KittyPal)
  database/   schema.mysql.sql       the same tables as plain SQL (only if you prefer phpMyAdmin / Workbench)
  docs/       API.md                 list of endpoints
```

## How to run (MySQL + 2 terminals)

You need **Node.js 18 or newer** (check with `node -v`) and a **MySQL** server (MySQL 8 / XAMPP / MariaDB all work).

**1. Create the database** (once). In phpMyAdmin or the MySQL shell:
```
CREATE DATABASE dormies CHARACTER SET utf8mb4;
```

**2. Backend - Terminal 1**
```
cd backend
npm install
copy .env.example .env        (Mac/Linux: cp .env.example .env)
```
Open `backend/.env` and set `DATABASE_URL` to your MySQL login, for example
`mysql://root:yourpassword@localhost:3306/dormies` (XAMPP has no root password: `mysql://root:@localhost:3306/dormies`).
Then create the tables and start the API:
```
npx prisma db push
npm start
```
The first start fills the database with sample data. API: http://localhost:5000

> If `npx prisma db push` is not possible on your computer, import `database/schema.mysql.sql` into the `dormies` database instead.
> If MySQL 8 says "Authentication plugin" or "public key" errors, run `ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'yourpassword';`.

**3. Frontend - Terminal 2**
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## Accounts

| Role | Username / Email | Password |
|------|------------------|----------|
| Administrator | `admin` or admin@dormies.com | `Admin@123` |
| Staff | `staff` or staff@dormies.com | `Staff@123` |
| Resident | `resident` or resident@dormies.com | `Resident@123` |

Tip for the demo video: each browser tab keeps its own login, so you can open three tabs and sign in as
the admin, the staff and the resident at the same time.

To wipe the database and start again with the sample data: `cd backend` then `npm run reset`.

## What each role can do

- **Administrator** - everything: residents, rooms and beds, billing (confirm bills, reminders), security deposits,
  transfer approvals, reports, announcements, user accounts, settings, backup and audit logs.
- **Staff** - residents, bed assignment and move-out, generate utility bills, record payments, maintenance,
  visitor logs, reports. Staff cannot confirm bills, approve transfers or change settings.
- **Resident** - own room, balance, statements, announcements and notifications; can send maintenance and
  room transfer requests. Read only for everything else.

## Rules from the paper that are in the code

- Passwords need 8+ characters with letters and numbers, and are stored hashed (bcrypt).
- 3 wrong passwords lock the account for 5 minutes. Deactivated accounts cannot sign in.
- A resident can only have one active bed. Occupied or maintenance beds cannot be assigned.
- A room with active residents cannot be set to maintenance. Room numbers are unique per building.
- Utility charges are split equally between the residents of a room. Bills stay drafts until the admin confirms them.
- Payments cannot be edited or deleted. Partial and over payments are accepted. Overdue bills get a late penalty.
- Move-out frees the bed and deactivates the resident account. The deposit stays on hold until the admin settles it.
- Transfers are approved by the admin only, and the deposit moves with the resident.
- Visitors: the host must be a current resident, daily visitor limit, curfew warning, optional expected check-out time.
- Records are archived, not deleted. Every important action is saved in the audit log.

## Tests

```
cd backend
npm test
```
Runs 16 API tests (login rules, role access, billing, move-out, transfers, visitors, reports, backup...) on a separate
database called `dormies_test`. `npm test` creates it for you, so the MySQL user must be allowed to create databases.
To use another login: `TEST_DATABASE_URL=mysql://user:pass@localhost:3306/my_test_db npm test` (the name must contain "test").

## Notes

- Emails are written to `backend/logs/emails.log` (there is no mail server). Only `email.service.js` needs to change to send real emails.
- Settings such as curfew, visitor limit, due day and late penalty can be changed in Settings (admin).
- Each bill is linked to the resident's bed assignment (`assignment_id`). MySQL has no partial unique index, so the rule
  "one active bed per resident / one active resident per bed" is kept with an `active_flag` column and two unique keys.
- Dates are sent to the frontend as plain text (`2026-10-25` or `2026-10-25 13:45:10`) and money as numbers.
  `backend/src/config/db.js` does this conversion, so the services never handle Date or Decimal objects.
