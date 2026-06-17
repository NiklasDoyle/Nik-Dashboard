import { Client } from '@notionhq/client'
import { notionColor } from './events.js'

// Currently Notion-backed. The shape returned here is the stable contract the
// frontend depends on — swapping to the real Strava API later only changes the
// internals of getStrava(), not this output.

const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  NOTION_DATE_PROPERTY = 'Date',
  NOTION_DISTANCE_PROP = 'Distance',
  NOTION_UNIT_PROP = 'Unit',
  NOTION_TAGS_PROP = 'Tags',
  NOTION_STATUS_PROP = 'Status',
  NOTION_TARGET_PROP = 'Target',
  RACE_DATE,
  RACE_START_DATE,
  RACE_BLOCK_WEEKS = '16',
} = process.env

const notion = NOTION_TOKEN ? new Client({ auth: NOTION_TOKEN }) : null

// ---- date helpers ----------------------------------------------------------

function ymd(d) {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  )
}

// Monday (00:00) of the current local week through the following Sunday.
function currentWeek(now = new Date()) {
  const day = now.getDay() // 0 = Sun, 1 = Mon, ...
  const offsetToMonday = (day + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetToMonday)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  return { start: ymd(monday), end: ymd(sunday) }
}

function raceConfig() {
  if (!RACE_DATE) return { date: null, start: null, weeks: Number(RACE_BLOCK_WEEKS) }
  const weeks = Number(RACE_BLOCK_WEEKS) || 16
  let start = RACE_START_DATE
  if (!start) {
    const d = new Date(`${RACE_DATE}T00:00:00`)
    d.setDate(d.getDate() - weeks * 7)
    start = ymd(d)
  }
  return { date: RACE_DATE, start, weeks }
}

// ---- Notion property readers -----------------------------------------------

function readSelectName(prop) {
  if (!prop) return null
  return prop.select?.name ?? prop.status?.name ?? null
}

function readWorkout(page) {
  const props = page.properties || {}
  const date = props[NOTION_DATE_PROPERTY]?.date?.start || null

  const titleProp = Object.values(props).find((p) => p.type === 'title')
  const title = (titleProp?.title ?? []).map((t) => t.plain_text).join('') || '(untitled)'

  const distance = props[NOTION_DISTANCE_PROP]?.number ?? null
  const unit = readSelectName(props[NOTION_UNIT_PROP])
  const tags = (props[NOTION_TAGS_PROP]?.multi_select ?? []).map((t) => t.name)
  const status = readSelectName(props[NOTION_STATUS_PROP])
  const targetProp = props[NOTION_TARGET_PROP]
  const target = readSelectName(targetProp)
  const targetColor = notionColor(targetProp?.select?.color || targetProp?.status?.color)

  const isRun = tags.some((t) => /run/i.test(t))
  const done = /done/i.test(status || '')

  let miles = null
  if (distance != null) {
    miles = /kilom|^km$/i.test(unit || '') ? distance * 0.621371 : distance
  }

  return { date, title, miles, isRun, done, target, targetColor }
}

// ---- main ------------------------------------------------------------------

const cache = { key: null, at: 0, data: null }
const TTL_MS = 60 * 1000

export async function getStrava() {
  const week = currentWeek()
  const race = raceConfig()
  const key = `${week.start}|${week.end}`

  if (cache.data && cache.key === key && Date.now() - cache.at < TTL_MS) {
    return { ...cache.data, race } // race recomputed cheaply (env-only)
  }

  if (!notion || !NOTION_DATABASE_ID) {
    return emptyPayload(week, race, 'Notion not configured')
  }

  try {
    const results = []
    let cursor
    do {
      const resp = await notion.databases.query({
        database_id: NOTION_DATABASE_ID,
        start_cursor: cursor,
        filter: {
          and: [
            { property: NOTION_DATE_PROPERTY, date: { on_or_after: week.start } },
            { property: NOTION_DATE_PROPERTY, date: { on_or_before: week.end } },
          ],
        },
      })
      results.push(...resp.results)
      cursor = resp.has_more ? resp.next_cursor : undefined
    } while (cursor)

    const workouts = results.map(readWorkout).filter((w) => w.date)

    // miles = planned distance; ran = completed distance. With Notion we only
    // know completion (done => full planned distance); the real Strava API will
    // later supply actual ran miles for partial fills.
    const runs = workouts
      .filter((w) => w.isRun)
      .map((w) => ({
        date: w.date,
        title: w.title,
        miles: w.miles,
        ran: w.done ? w.miles || 0 : 0,
        done: w.done,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
    const miles = runs.reduce((s, r) => s + (r.ran || 0), 0)
    const plannedMiles = runs.reduce((s, r) => s + (r.miles || 0), 0)

    // Other workouts done this week (non-run), grouped by label.
    const groups = new Map()
    for (const w of workouts) {
      if (w.isRun || !w.done) continue
      const label = w.target || w.title
      const g = groups.get(label) || { label, color: w.targetColor, count: 0 }
      g.count++
      groups.set(label, g)
    }

    const payload = {
      week,
      running: { miles, plannedMiles, runs },
      otherWorkouts: [...groups.values()],
      source: 'notion',
      error: null,
    }
    cache.key = key
    cache.at = Date.now()
    cache.data = payload
    return { ...payload, race }
  } catch (err) {
    return emptyPayload(week, race, String(err.message || err))
  }
}

function emptyPayload(week, race, error) {
  return {
    week,
    race,
    running: { miles: 0, plannedMiles: 0, runs: [] },
    otherWorkouts: [],
    source: 'notion',
    error,
  }
}
