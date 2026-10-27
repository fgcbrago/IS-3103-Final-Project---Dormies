# Dormies API (all routes start with /api, JSON, `Authorization: Bearer <token>`)

| Area | Endpoints | Roles |
|------|-----------|-------|
| Auth | POST /auth/login, GET /auth/me, POST /auth/change-password, POST /auth/logout | all |
| Users | GET/POST /users, PUT /users/:id, PATCH /users/:id/activate or deactivate, POST /users/:id/reset-password | Admin |
| Settings | GET /settings/public, GET/PUT /settings | all / Admin |
| Rooms | GET/POST/PUT/DELETE /rooms, /rooms/buildings, /rooms/beds, PATCH /rooms/beds/:id/status | Staff read, Admin write |
| Residents | GET/POST/PUT /residents, PATCH /residents/:id/archive or restore | Admin, Staff |
| Assignments | GET /residents/assignments/all, POST /residents/assignments, POST .../:id/move-out, POST .../:id/deposit (Admin), GET .../deposits (Admin) | Admin, Staff |
| Billing | GET /billing, POST /billing/generate, POST /billing/confirm (Admin), POST /billing/reminders (Admin), DELETE /billing/:id (drafts) | Admin, Staff |
| Payments | GET/POST /billing/payments, GET /billing/payments/:id | Admin, Staff |
| Maintenance | GET/POST /requests/maintenance, PUT /requests/maintenance/:id, GET /requests/maintenance/meta | Admin, Staff |
| Transfers | GET/POST /requests/transfers, POST /requests/transfers/:id/review (Admin) | Admin, Staff |
| Visitors | GET/POST /visitors, PATCH /visitors/:id/check-out | Admin, Staff |
| Announcements | GET/POST/PUT/DELETE /announcements, PATCH .../pin, unpin, archive (Admin), GET /announcements/feed | Admin / all |
| Notifications | GET /announcements/notifications, /unread-count, PATCH .../:id/read, POST .../read-all | all |
| Reports | GET /dashboard/admin, /dashboard/staff, /reports/summary | Admin / Staff |
| Audit and backup | GET /audit, GET /backup, POST /restore | Admin |
| Resident portal | GET /portal/overview, /portal/bills, /portal/available-beds, POST /portal/maintenance, POST /portal/transfers | Resident |

## Notes on newer fields

- `GET /rooms` returns every room with a `beds` array (`bed_id`, `bed_code`, `status`, and the resident name when occupied).
- `POST /visitors` accepts an optional `expected_check_out_time` (`2026-10-26T18:30` or `2026-10-26 18:30:00`, must be after check-in).
- `GET /reports/summary` accepts `from`, `to` (billing periods like `2026-05`), plus `room_id` and `resident_id` to filter every figure.
- Every bill has an `assignment_id` (the resident's bed assignment it was generated for).
