// Creates (or re-creates) the empty MySQL test database with all the tables, used by `npm test`.
// Uses TEST_DATABASE_URL, or mysql://root:@localhost:3306/dormies_test when it is not set.
const fs = require('fs')
const path = require('path')
const mariadb = require('mariadb')

const url = new URL(process.env.TEST_DATABASE_URL || 'mysql://root:@localhost:3306/dormies_test')
const database = url.pathname.replace(/^\//, '')
if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('The test database name can only have letters, numbers and underscores.')
if (!/test/i.test(database)) throw new Error(`Refusing to wipe "${database}" because its name does not contain "test".`)

;(async () => {
  const conn = await mariadb.createConnection({
    host: url.hostname, port: Number(url.port) || 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    multipleStatements: true, allowPublicKeyRetrieval: true,
  })
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``)
    await conn.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`)
    await conn.query(`USE \`${database}\``)
    await conn.query(fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.mysql.sql'), 'utf8'))
    console.log(`Test database "${database}" is ready.`)
  } finally {
    await conn.end()
  }
})().catch((err) => {
  console.error('Could not prepare the test database. Is MySQL running and is the user allowed to create databases?')
  console.error(err.message)
  process.exit(1)
})
