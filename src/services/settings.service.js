const db = require('../config/db')

// default values, used when the admin has not changed anything yet
const DEFAULTS = {
  dormitory_name: 'Dormies Residence Hall',
  contact_email: 'office@dormies.com',
  curfew_time: '22:00',
  max_visitors_per_day: '3',
  billing_due_day: '20',
  late_penalty_percent: '5',
  currency_symbol: 'PHP',
}

async function all() {
  const rows = await db.m.setting.findMany()
  const out = { ...DEFAULTS }
  rows.forEach((r) => (out[r.setting_key] = r.setting_value))
  return out
}

const get = async (key) => (await all())[key]

async function update(values) {
  await db.tx(async () => {
    for (const k of Object.keys(DEFAULTS)) {
      if (values[k] === undefined) continue
      await db.m.setting.upsert({
        where: { setting_key: k },
        update: { setting_value: String(values[k]) },
        create: { setting_key: k, setting_value: String(values[k]) },
      })
    }
  })
  return all()
}

module.exports = { all, get, update, DEFAULTS }
