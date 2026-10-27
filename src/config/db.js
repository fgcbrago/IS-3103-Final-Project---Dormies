// Database access: Prisma Client (MySQL).
//
// - db.m.<model>      the Prisma model API (db.m.user.findMany(...)), always the current transaction if there is one
// - db.all / db.get   raw SQL through Prisma ($queryRawUnsafe) for the report-style queries with joins and totals
// - db.tx(fn)         runs fn in one transaction, if anything throws everything is rolled back
//
// Dates are written and read as plain strings ('2026-10-25' or '2026-10-25 13:45:10') and money as numbers,
// so the rest of the code does not have to deal with Date and Decimal objects.
const { AsyncLocalStorage } = require('async_hooks')
const { PrismaClient, Prisma } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
const { databaseUrl } = require('./env')

const url = new URL(databaseUrl)
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
  connectionLimit: Number(process.env.DB_POOL) || 10,
  allowPublicKeyRetrieval: true,
  timezone: '+00:00', // dates are kept exactly as written, no timezone shifting
})

/* ---------- string <-> Date/Decimal conversion ---------- */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

const toDate = (s) => new Date(DATE_ONLY.test(s) ? `${s}T00:00:00Z` : `${s.replace(' ', 'T')}Z`)

function fromDate(d) {
  const iso = d.toISOString()
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ')
}

// results: Date -> string, Decimal / BigInt -> number
function fromDb(v) {
  if (v === null || v === undefined) return v
  if (v instanceof Date) return fromDate(v)
  if (typeof v === 'bigint') return Number(v)
  if (typeof v !== 'object') return v
  if (Prisma.Decimal.isDecimal(v)) return v.toNumber()
  if (Array.isArray(v)) return v.map(fromDb)
  const out = {}
  for (const k of Object.keys(v)) out[k] = fromDb(v[k])
  return out
}

// query arguments: 'YYYY-MM-DD' strings -> Date, undefined stays undefined
function toDb(v) {
  if (typeof v === 'string') return DATE_ONLY.test(v) || DATE_TIME.test(v) ? toDate(v) : v
  if (v === null || typeof v !== 'object' || v instanceof Date || Prisma.Decimal.isDecimal(v)) return v
  if (Array.isArray(v)) return v.map(toDb)
  const out = {}
  for (const k of Object.keys(v)) out[k] = toDb(v[k])
  return out
}

const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return fromDb(await query(toDb(args)))
      },
    },
  },
})

/* ---------- transactions ---------- */

const store = new AsyncLocalStorage()
const client = () => store.getStore() || prisma

async function tx(fn, options) {
  if (store.getStore()) return fn() // already inside a transaction
  return prisma.$transaction((t) => store.run(t, fn), { maxWait: 15000, timeout: 120000, ...options })
}

/* ---------- raw SQL ---------- */

const cleanParams = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v))

const db = {
  prisma,
  Prisma,
  tx,
  // the current client (the transaction one when inside db.tx)
  c: client,
  // db.m.user.findMany(...) -> model API on the current client
  m: new Proxy({}, { get: (_, model) => client()[model] }),

  all: async (sql, params = []) => fromDb(await client().$queryRawUnsafe(sql, ...cleanParams(params))),
  get: async (sql, params = []) => {
    const rows = await db.all(sql, params)
    return rows[0] || null
  },
  run: async (sql, params = []) => Number(await client().$executeRawUnsafe(sql, ...cleanParams(params))),

  fromDb,
  toDb,
  close: () => prisma.$disconnect(),
}

module.exports = db
