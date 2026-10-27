const db = require('../config/db')
const { now, addDays } = require('../lib/dates')

// writes one line in the audit trail (who did what, to which record)
async function log(req, action, entity, entityId, details) {
  const text = details === undefined ? null : typeof details === 'string' ? details : JSON.stringify(details)
  await db.m.auditLog.create({
    data: {
      user_id: req && req.user ? req.user.user_id : null,
      action,
      entity_affected: entity,
      entity_id: entityId || null,
      details: text,
      ip_address: req && req.ip ? String(req.ip).slice(0, 45) : null,
      timestamp: now(),
    },
  })
}

async function list({ action, entity, user_id, from, to, limit } = {}) {
  const where = {}
  if (action) where.action = action
  if (entity) where.entity_affected = entity
  if (user_id) where.user_id = Number(user_id)
  if (from || to) {
    where.timestamp = {}
    if (from) where.timestamp.gte = from
    if (to) where.timestamp.lt = addDays(to, 1)
  }
  const rows = await db.m.auditLog.findMany({
    where,
    include: { user: { select: { username: true } } },
    orderBy: { audit_id: 'desc' },
    take: Math.min(Number(limit) || 200, 1000),
  })
  return rows.map(({ user, ...a }) => ({ ...a, username: user ? user.username : null }))
}

module.exports = { log, list }
