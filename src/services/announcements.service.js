const db = require('../config/db')
const AppError = require('../lib/AppError')
const validate = require('../lib/validate')
const { now, today } = require('../lib/dates')
const audit = require('./audit.service')
const notify = require('./notification.service')

const rules = {
  title: { required: true, max: 120, label: 'Title' },
  content: { required: true, min: 5, max: 3000, label: 'Message' },
  priority: { type: 'enum', values: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal', label: 'Priority' },
  target_audience: { type: 'enum', values: ['All', 'Residents', 'Staff'], default: 'All', label: 'Audience' },
  status: { type: 'enum', values: ['Draft', 'Published'], default: 'Published', label: 'Status' },
  is_pinned: { type: 'bool', default: false, label: 'Pinned' },
  expires_at: { type: 'date', label: 'Expiry date' },
  publish_at: { type: 'date', label: 'Publish date' },
}

const SELECT = `SELECT a.*, u.full_name AS posted_by,
  (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.announcement_id) AS read_count
  FROM announcements a JOIN users u ON u.user_id = a.posted_by_user_id`

// what the admin sees on the management page
function listAll({ status, audience, search } = {}) {
  const where = []
  const params = []
  if (status) { where.push('a.status = ?'); params.push(status) }
  if (audience) { where.push('a.target_audience = ?'); params.push(audience) }
  if (search) { where.push('(a.title LIKE ? OR a.content LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
  return db.all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.is_pinned DESC, a.announcement_id DESC`, params)
}

// what staff and residents see: published, already scheduled in, not expired, meant for them
async function listVisible(user) {
  const audiences = user.role === 'Resident' ? ['All', 'Residents'] : ['All', 'Staff']
  const rows = await db.all(
    `${SELECT} WHERE a.status = 'Published' AND a.target_audience IN (${audiences.map(() => '?').join(',')})
       AND (a.publish_at IS NULL OR a.publish_at <= ?) AND (a.expires_at IS NULL OR a.expires_at >= ?)
     ORDER BY a.is_pinned DESC, CASE a.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 ELSE 2 END, a.announcement_id DESC`,
    [...audiences, today(), today()],
  )
  // opening the feed counts as reading it
  for (const r of rows) {
    const key = { announcement_id: r.announcement_id, user_id: user.user_id }
    if (!(await db.m.announcementRead.findUnique({ where: { announcement_id_user_id: key } }))) {
      await db.m.announcementRead.create({ data: { ...key, read_at: now() } })
    }
  }
  return rows
}

async function getOne(id) {
  const a = await db.get(`${SELECT} WHERE a.announcement_id = ?`, [id])
  if (!a) throw new AppError(404, 'Announcement not found.')
  return a
}

// a high or urgent announcement also goes to the notification feed of the people it is meant for
async function pushNotifications(a) {
  if (!['High', 'Urgent'].includes(a.priority)) return
  if (a.publish_at && a.publish_at > today()) return
  const roles = a.target_audience === 'All' ? ['Resident', 'Staff'] : a.target_audience === 'Residents' ? ['Resident'] : ['Staff']
  for (const r of roles) await notify.createForRole(r, 'Announcement', a.title, a.content, a.announcement_id)
}

async function create(body, req) {
  const d = validate(body, rules)
  const created = await db.m.announcement.create({
    data: {
      posted_by_user_id: req.user.user_id, title: d.title, content: d.content, priority: d.priority, target_audience: d.target_audience,
      status: d.status, is_pinned: !!d.is_pinned, publish_at: d.publish_at, created_at: now(), expires_at: d.expires_at,
    },
  })
  const a = await getOne(created.announcement_id)
  if (a.status === 'Published') await pushNotifications(a)
  await audit.log(req, 'CREATE', 'announcements', a.announcement_id, { title: d.title, priority: d.priority })
  return a
}

async function update(id, body, req) {
  const old = await getOne(id)
  if (old.status === 'Archived') throw new AppError(409, 'Archived announcements cannot be edited.')
  const d = validate(body, rules)
  await db.m.announcement.update({
    where: { announcement_id: id },
    data: { title: d.title, content: d.content, priority: d.priority, target_audience: d.target_audience, status: d.status, is_pinned: !!d.is_pinned, publish_at: d.publish_at, expires_at: d.expires_at },
  })
  const a = await getOne(id)
  // draft that has just been published
  if (old.status === 'Draft' && a.status === 'Published') await pushNotifications(a)
  await audit.log(req, 'UPDATE', 'announcements', id, { title: d.title })
  return a
}

async function setPinned(id, pinned, req) {
  await getOne(id)
  await db.m.announcement.update({ where: { announcement_id: id }, data: { is_pinned: !!pinned } })
  await audit.log(req, 'UPDATE', 'announcements', id, pinned ? 'Pinned' : 'Unpinned')
  return getOne(id)
}

async function archive(id, req) {
  await getOne(id)
  await db.m.announcement.update({ where: { announcement_id: id }, data: { status: 'Archived', is_pinned: false } })
  await audit.log(req, 'UPDATE', 'announcements', id, 'Archived')
  return getOne(id)
}

async function remove(id, req) {
  const a = await getOne(id)
  await db.tx(async () => {
    await db.m.announcementRead.deleteMany({ where: { announcement_id: id } })
    await db.m.announcement.delete({ where: { announcement_id: id } })
    await audit.log(req, 'DELETE', 'announcements', id, { title: a.title })
  })
}

module.exports = { listAll, listVisible, getOne, create, update, setPinned, archive, remove }
