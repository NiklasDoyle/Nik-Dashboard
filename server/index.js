import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEvents } from './events.js'
import { getFitness } from './fitness.js'
import { getStrava } from './strava.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Merged events endpoint. Defaults to a wide window if start/end are omitted.
app.get('/api/events', async (req, res) => {
  try {
    const now = new Date()
    const start = req.query.start
      ? new Date(req.query.start)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = req.query.end
      ? new Date(req.query.end)
      : new Date(now.getFullYear(), now.getMonth() + 2, 0)
    const payload = await getEvents(start, end)
    res.json(payload)
  } catch (err) {
    console.error('[events] error', err)
    res.status(500).json({ events: [], errors: { server: String(err.message || err) } })
  }
})

// Fitness data parsed from the newest MacroFactor export in the data folder.
app.get('/api/fitness', async (_req, res) => {
  try {
    res.json(await getFitness())
  } catch (err) {
    console.error('[fitness] error', err)
    res.status(500).json({ days: [], week: [], today: null, error: String(err.message || err) })
  }
})

// Weekly running + race countdown (Notion-backed for now).
app.get('/api/strava', async (_req, res) => {
  try {
    res.json(await getStrava())
  } catch (err) {
    console.error('[strava] error', err)
    res.status(500).json({ running: { miles: 0, runs: [] }, otherWorkouts: [], error: String(err.message || err) })
  }
})

// In production, serve the built frontend so everything runs on one port.
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`Dashboard server listening on http://localhost:${PORT}`)
})
