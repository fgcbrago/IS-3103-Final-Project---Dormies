// reads the .env file (if there is one) without needing the dotenv package
const fs = require('fs')
const path = require('path')

const envFile = path.join(__dirname, '..', '..', '.env')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  })
}

const root = path.join(__dirname, '..', '..')

module.exports = {
  port: Number(process.env.PORT) || 5000,
  jwtSecret: process.env.JWT_SECRET || 'dormies-dev-secret-change-me',
  jwtExpiresHours: Number(process.env.JWT_EXPIRES_HOURS) || 8,
  // mysql://USER:PASSWORD@HOST:PORT/DATABASE
  databaseUrl: process.env.DATABASE_URL || 'mysql://root:@localhost:3306/dormies',
  root,
}
