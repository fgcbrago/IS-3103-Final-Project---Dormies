const db = require('../config/db')
const AppError = require('../lib/AppError')
const audit = require('./audit.service')

// parents first, so foreign keys are happy when restoring
const TABLES = [
  'roles', 'users', 'residents', 'emergency_contacts', 'buildings', 'rooms', 'beds', 'bed_assignments', 'bills', 'payments',
  'maintenance_requests', 'transfer_requests', 'announcements', 'announcement_reads', 'notifications', 'visitor_logs', 'audit_logs', 'settings',
]

async function exportAll(req) {
  const tables = {}
  for (const t of TABLES) tables[t] = await db.all(`SELECT * FROM ${t}`)
  await audit.log(req, 'EXPORT', 'database', null, 'Backup downloaded')
  return { app: 'dormies', version: 2, created_at: new Date().toISOString(), tables }
}

async function restore(data, req) {
  if (!data || data.app !== 'dormies' || !data.tables) {
    throw new AppError(400, 'This file is not a Dormies backup.')
  }
  if (!(data.version >= 2)) {
    throw new AppError(400, 'This backup was made with an older version of Dormies (before the MySQL database) and cannot be restored.')
  }
  TABLES.forEach((t) => {
    if (!Array.isArray(data.tables[t])) throw new AppError(400, `The backup file is missing the "${t}" table.`)
  })
  await db.tx(async () => {
    // foreign key checks are switched off only while the tables are emptied and refilled on this connection
    await db.run('SET FOREIGN_KEY_CHECKS = 0')
    try {
      for (const t of [...TABLES].reverse()) await db.run(`DELETE FROM ${t}`)
      for (const t of TABLES) {
        for (const row of data.tables[t]) {
          const cols = Object.keys(row)
          if (!cols.length) continue
          if (!cols.every((c) => /^[a-z_]+$/.test(c))) throw new AppError(400, 'The backup file has an invalid column name.')
          await db.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]))
        }
      }
    } finally {
      await db.run('SET FOREIGN_KEY_CHECKS = 1')
    }
  }, { timeout: 300000 })
  await audit.log(req, 'RESTORE', 'database', null, 'Database restored from backup')
  return { message: 'Backup restored.' }
}

module.exports = { exportAll, restore, TABLES }
