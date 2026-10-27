const db = require('../config/db')
const AppError = require('../lib/AppError')
const { now } = require('../lib/dates')
const email = require('./email.service')

// adds an in-app notification, and an email too when asked.
// notifications for deactivated accounts are skipped (rule from the paper)
async function create(userId, type, title, message, referenceId, withEmail) {
  const u = await db.m.user.findUnique({ where: { user_id: userId }, select: { user_id: true, email: true, is_active: true } })
  if (!u || !u.is_active) return null
  let status = 'Not sent'
  if (withEmail) status = email.send(u.email, title, message)
  const n = await db.m.notification.create({
    data: { user_id: userId, title: title.slice(0, 100), message: message.slice(0, 255), type, reference_id: referenceId || null, is_read: false, email_status: status, created_at: now() },
  })
  return n.notification_id
}

// sends the same notification to every active user of a role
async function createForRole(roleName, type, title, message, referenceId) {
  const users = await db.m.user.findMany({ where: { is_active: true, role: { role_name: roleName } }, select: { user_id: true } })
  for (const u of users) await create(u.user_id, type, title, message, referenceId, false)
}

// finds the user account of a resident and notifies it
async function createForResident(residentId, type, title, message, referenceId, withEmail) {
  const r = await db.m.resident.findUnique({ where: { resident_id: residentId }, select: { user_id: true } })
  if (r && r.user_id) return create(r.user_id, type, title, message, referenceId, withEmail)
  return null
}

function listForUser(userId, { unread } = {}) {
  return db.m.notification.findMany({
    where: { user_id: userId, ...(unread ? { is_read: false } : {}) },
    orderBy: { notification_id: 'desc' },
    take: 100,
  })
}

const unreadCount = (userId) => db.m.notification.count({ where: { user_id: userId, is_read: false } })

async function markRead(userId, id) {
  const n = await db.m.notification.findFirst({ where: { notification_id: id, user_id: userId } })
  if (!n) throw new AppError(404, 'Notification not found.')
  await db.m.notification.update({ where: { notification_id: id }, data: { is_read: true } })
}

const markAllRead = (userId) => db.m.notification.updateMany({ where: { user_id: userId }, data: { is_read: true } })

// delivery log (admin) - shows what was sent by email
async function deliveryLog(limit = 100) {
  const rows = await db.m.notification.findMany({
    where: { email_status: { not: 'Not sent' } },
    include: { user: { select: { email: true } } },
    orderBy: { notification_id: 'desc' },
    take: limit,
  })
  return rows.map((n) => ({ notification_id: n.notification_id, title: n.title, type: n.type, email_status: n.email_status, created_at: n.created_at, email: n.user.email }))
}

module.exports = { create, createForRole, createForResident, listForUser, unreadCount, markRead, markAllRead, deliveryLog }
