const fs = require('fs')
const path = require('path')
const express = require('express')
const { Router } = require('./lib/router')
const errorHandler = require('./middleware/errorHandler')
const { root } = require('./config/env')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '10mb' }))

// res.download(filename, content, contentType) sends text we already built (used for CSV / backup files)
app.use((req, res, next) => {
  res.download = (filename, content, type) => {
    res.setHeader('Content-Type', type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.end(content)
  }
  next()
})

// tiny request logger
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    if (req.path.startsWith('/api') && process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`)
  })
  next()
})

const api = Router()
api.get('/health', (req, res) => res.json({ status: 'ok', app: 'Dormies API' }))
api.use('/auth', require('./routes/auth.routes'))
api.use('/users', require('./routes/users.routes'))
api.use('/settings', require('./routes/settings.routes'))
api.use('/rooms', require('./routes/rooms.routes'))
api.use('/residents', require('./routes/residents.routes'))
api.use('/billing', require('./routes/billing.routes'))
api.use('/requests', require('./routes/requests.routes'))
api.use('/announcements', require('./routes/announcements.routes'))
api.use('/visitors', require('./routes/visitors.routes'))
api.use('/portal', require('./routes/portal.routes'))
api.use('/', require('./routes/reports.routes'))
app.use('/api', api)
app.use('/api', (req, res) => res.status(404).json({ message: 'That API route does not exist.' }))

// if the frontend was built (npm run build), the backend can serve it too
const dist = path.join(root, '..', 'frontend', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use(errorHandler)

module.exports = app
