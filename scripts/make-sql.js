// Turns prisma/schema.prisma into plain MySQL CREATE TABLE statements (database/schema.mysql.sql).
// You normally do not need this: `npx prisma db push` builds the tables for you.
// The SQL file is only for people who prefer to import the tables with phpMyAdmin / MySQL Workbench.
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const outPath = path.join(__dirname, '..', '..', 'database', 'schema.mysql.sql')
const text = fs.readFileSync(schemaPath, 'utf8')

const models = []
const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
let m
while ((m = re.exec(text))) {
  const model = { name: m[1], table: m[1], fields: [], uniques: [], indexes: [], pk: null }
  m[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).forEach((line) => {
    if (line.startsWith('@@map')) return (model.table = line.match(/"([^"]+)"/)[1])
    if (line.startsWith('@@unique')) return model.uniques.push(parseIdx(line))
    if (line.startsWith('@@index')) return model.indexes.push(parseIdx(line))
    if (line.startsWith('@@id')) return (model.pk = parseIdx(line).cols)
    const f = line.match(/^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/)
    if (f) model.fields.push({ name: f[1], type: f[2], list: f[3] === '[]', optional: f[3] === '?', attrs: f[4] })
  })
  models.push(model)
}

function parseIdx(line) {
  const cols = line.match(/\[([^\]]+)\]/)[1].split(',').map((s) => s.trim())
  const map = line.match(/map:\s*"([^"]+)"/)
  return { cols, name: map ? map[1] : null }
}

const byName = Object.fromEntries(models.map((x) => [x.name, x]))

function sqlType(f) {
  const a = f.attrs
  const db = a.match(/@db\.(\w+)(?:\(([^)]*)\))?/)
  if (db) {
    const [, t, arg] = db
    if (t === 'VarChar') return `VARCHAR(${arg})`
    if (t === 'Text') return 'TEXT'
    if (t === 'Date') return 'DATE'
    if (t === 'DateTime') return 'DATETIME'
    if (t === 'Decimal') return `DECIMAL(${arg.replace(/\s/g, '')})`
  }
  switch (f.type) {
    case 'Int': return 'INT'
    case 'Boolean': return 'TINYINT(1)'
    case 'String': return 'VARCHAR(191)'
    case 'DateTime': return 'DATETIME(3)'
    case 'Decimal': return 'DECIMAL(65,30)'
    default: throw new Error('Unknown type ' + f.type)
  }
}

function defaultOf(f) {
  const start = f.attrs.indexOf('@default(')
  if (start < 0) return ''
  // read up to the matching closing bracket (so now() and autoincrement() work)
  let depth = 0
  let i = start + '@default'.length
  let v = ''
  for (; i < f.attrs.length; i++) {
    const c = f.attrs[i]
    if (c === '(') { depth++; if (depth === 1) continue }
    if (c === ')') { depth--; if (depth === 0) break }
    v += c
  }
  v = v.trim()
  if (v === 'autoincrement()') return ''
  if (v === 'now()') return ' DEFAULT CURRENT_TIMESTAMP'
  if (v === 'true') return ' DEFAULT 1'
  if (v === 'false') return ' DEFAULT 0'
  return ` DEFAULT ${v.startsWith('"') ? "'" + v.slice(1, -1) + "'" : v}`
}

const out = ['-- Generated from backend/prisma/schema.prisma by `npm run db:sql`. Do not edit by hand.', '-- Tables for the Dormies MySQL database (16 tables from the data dictionary + settings + announcement_reads).', '']
const order = []
const seen = new Set()
function visit(model) {
  if (seen.has(model.name)) return
  seen.add(model.name)
  model.fields.forEach((f) => {
    const rel = f.attrs.match(/@relation\([^)]*fields:\s*\[(\w+)\][^)]*\)/)
    if (rel && byName[f.type]) visit(byName[f.type])
  })
  order.push(model)
}
models.forEach(visit)

order.forEach((model) => {
  const cols = []
  const tail = []
  const pkCols = model.pk || model.fields.filter((f) => /@id\b/.test(f.attrs)).map((f) => f.name)
  model.fields.forEach((f) => {
    if (f.list || byName[f.type]) {
      const rel = f.attrs.match(/@relation\(([^)]*)\)/)
      if (rel && /fields:/.test(rel[1])) {
        const from = rel[1].match(/fields:\s*\[(\w+)\]/)[1]
        const to = rel[1].match(/references:\s*\[(\w+)\]/)[1]
        const cascade = /onDelete:\s*Cascade/.test(rel[1]) ? ' ON DELETE CASCADE' : ''
        tail.push(`  CONSTRAINT fk_${model.table}_${from} FOREIGN KEY (${from}) REFERENCES ${byName[f.type].table}(${to})${cascade}`)
      }
      return
    }
    const auto = /autoincrement\(\)/.test(f.attrs) ? ' AUTO_INCREMENT' : ''
    const unique = /@unique\b/.test(f.attrs) ? ' UNIQUE' : ''
    cols.push(`  ${f.name} ${sqlType(f)}${f.optional ? ' NULL' : ' NOT NULL'}${auto}${defaultOf(f)}${unique}`)
  })
  if (pkCols.length) cols.push(`  PRIMARY KEY (${pkCols.join(', ')})`)
  model.uniques.forEach((u) => cols.push(`  UNIQUE KEY ${u.name || 'ux_' + model.table + '_' + u.cols.join('_')} (${u.cols.join(', ')})`))
  model.indexes.forEach((i) => cols.push(`  KEY ${i.name || 'ix_' + model.table + '_' + i.cols.join('_')} (${i.cols.join(', ')})`))
  out.push(`CREATE TABLE IF NOT EXISTS ${model.table} (\n${cols.concat(tail).join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`)
})

fs.writeFileSync(outPath, out.join('\n'))
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${order.length} tables)`)
