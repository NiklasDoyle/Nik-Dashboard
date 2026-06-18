import { Client } from '@notionhq/client'
import ical from 'node-ical'

// Distinct colors so the sources are visually separable on the calendar,
// matching the "overlay" feel of the Notion Calendar app.
const NOTION_COLOR = '#d16e27' // workout / Notion (orange)

// Colors auto-assigned to Google calendars (in order) when none is specified.
const GOOGLE_PALETTE = ['#4a8cff', '#37b24d', '#f59f00', '#9775fa', '#22b8cf', '#ff922b']

const {
  NOTION_TOKEN,
  NOTION_DATABASE_ID,
  NOTION_DATE_PROPERTY = 'Date',
  NOTION_TITLE_PROPERTY = '',
} = process.env

// Build the list of Google calendars to import from the environment.
// Two formats are supported:
//   1. GOOGLE_ICAL_URL  — one URL, or several comma-separated (auto colors).
//   2. GOOGLE_CALENDARS — JSON array of { "name", "url", "color" } for full
//      control over each calendar's label and color.
function getGoogleCalendars() {
  if (process.env.GOOGLE_CALENDARS) {
    try {
      const arr = JSON.parse(process.env.GOOGLE_CALENDARS)
      return arr
        .filter((c) => c && c.url)
        .map((c, i) => ({
          url: c.url,
          name: c.name || `Google calendar ${i + 1}`,
          color: c.color || GOOGLE_PALETTE[i % GOOGLE_PALETTE.length],
        }))
    } catch (e) {
      console.error('Invalid GOOGLE_CALENDARS JSON:', e.message)
    }
  }

  const urls = (process.env.GOOGLE_ICAL_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return urls.map((url, i) => ({
    url,
    name: `Google calendar ${i + 1}`,
    color: GOOGLE_PALETTE[i % GOOGLE_PALETTE.length],
  }))
}

const notion = NOTION_TOKEN ? new Client({ auth: NOTION_TOKEN }) : null

// ---- Notion ----------------------------------------------------------------

function extractTitle(properties, titleProp) {
  // Use the configured title property if given, otherwise find the column of
  // type "title" (every Notion DB has exactly one).
  let prop = titleProp && properties[titleProp]
  if (!prop) {
    prop = Object.values(properties).find((p) => p.type === 'title')
  }
  const parts = prop?.title ?? []
  return parts.map((t) => t.plain_text).join('') || '(untitled)'
}

// Notion color names -> dark-mode-friendly chip backgrounds.
const NOTION_COLORS = {
  default: '#4b5563',
  gray: '#4b5563',
  brown: '#6b4f3f',
  orange: '#b45309',
  yellow: '#a16207',
  green: '#15803d',
  blue: '#1d4ed8',
  purple: '#6d28d9',
  pink: '#be185d',
  red: '#b91c1c',
}

export function notionColor(name) {
  // Notion appends "_background" for background-colored chips; strip it.
  const base = (name || 'default').replace('_background', '')
  return NOTION_COLORS[base] || NOTION_COLORS.default
}

// Turn one Notion property into a display detail, or null if empty/unsupported.
// Colored types (select/status/multi_select) return chip values with a color;
// plain types (number/text/date) return values without one.
function detailFromProp(name, prop) {
  switch (prop.type) {
    case 'select':
      return prop.select
        ? { key: name, values: [{ text: prop.select.name, color: notionColor(prop.select.color) }] }
        : null
    case 'status':
      return prop.status
        ? { key: name, values: [{ text: prop.status.name, color: notionColor(prop.status.color) }] }
        : null
    case 'multi_select':
      return prop.multi_select.length
        ? {
            key: name,
            values: prop.multi_select.map((s) => ({ text: s.name, color: notionColor(s.color) })),
          }
        : null
    case 'number':
      return prop.number === null || prop.number === undefined
        ? null
        : { key: name, values: [{ text: String(prop.number) }] }
    case 'rich_text': {
      const txt = prop.rich_text.map((t) => t.plain_text).join('')
      return txt ? { key: name, values: [{ text: txt }] } : null
    }
    case 'checkbox':
      return prop.checkbox ? { key: name, values: [{ text: 'Yes' }] } : null
    case 'date':
      return prop.date?.start ? { key: name, values: [{ text: prop.date.start }] } : null
    case 'formula': {
      const f = prop.formula
      const v = f?.[f?.type]
      return v === null || v === undefined || v === ''
        ? null
        : { key: name, values: [{ text: String(v) }] }
    }
    default:
      return null
  }
}

// All populated properties except the title and the (already-used) date column.
function extractDetails(properties, skipNames) {
  const details = []
  for (const [name, prop] of Object.entries(properties)) {
    if (prop.type === 'title' || skipNames.includes(name)) continue
    const d = detailFromProp(name, prop)
    if (d) details.push(d)
  }
  return details
}

async function fetchNotionEvents() {
  if (!notion || !NOTION_DATABASE_ID) return []

  const results = []
  let cursor
  do {
    const resp = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      start_cursor: cursor,
      filter: {
        property: NOTION_DATE_PROPERTY,
        date: { is_not_empty: true },
      },
    })
    results.push(...resp.results)
    cursor = resp.has_more ? resp.next_cursor : undefined
  } while (cursor)

  return results
    .map((page) => {
      const dateProp = page.properties?.[NOTION_DATE_PROPERTY]
      const date = dateProp?.date
      if (!date?.start) return null
      // All-day when the start has no time component (no "T").
      const allDay = !date.start.includes('T')
      return {
        id: `notion-${page.id}`,
        title: extractTitle(page.properties, NOTION_TITLE_PROPERTY),
        start: date.start,
        end: date.end ?? undefined,
        allDay,
        source: 'notion',
        color: NOTION_COLOR,
        url: page.url,
        details: extractDetails(page.properties, [NOTION_DATE_PROPERTY]),
      }
    })
    .filter(Boolean)
}

// ---- Google Calendar (iCal) ------------------------------------------------

// node-ical's rrule.between() returns each occurrence with the correct UTC
// time-of-day but stamped on the event's *local* calendar date — so an evening
// event whose local->UTC conversion crosses midnight comes back a day early.
// We rebuild the true instant from the recurrence's local date plus the series'
// wall-clock time, converted through the event's IANA timezone (no extra deps).
function zonedParts(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
}

// Offset (ms) of a zone at an instant: (wall-clock-read-as-UTC) - actual UTC.
function tzOffsetMs(tz, date) {
  const p = zonedParts(tz, date)
  return Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s) - date.getTime()
}

// The UTC instant whose wall-clock time in `tz` is the given Y/M/D H:M:S.
// Two passes settle the offset correctly around DST boundaries.
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  let guess = Date.UTC(y, mo, d, h, mi, s)
  for (let i = 0; i < 2; i++) guess = Date.UTC(y, mo, d, h, mi, s) - tzOffsetMs(tz, new Date(guess))
  return new Date(guess)
}

// Fetch all configured Google calendars in parallel. One failing calendar
// doesn't blank the others — its error is reported under its name.
async function fetchAllGoogleEvents(rangeStart, rangeEnd) {
  const cals = getGoogleCalendars()
  const results = await Promise.allSettled(
    cals.map((cal) => fetchGoogleCalendar(cal, rangeStart, rangeEnd)),
  )

  const events = []
  const errors = {}
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') events.push(...res.value)
    else errors[cals[i].name] = String(res.reason?.message || res.reason)
  })
  return { events, errors }
}

async function fetchGoogleCalendar(cal, rangeStart, rangeEnd) {
  const data = await ical.async.fromURL(cal.url)
  const events = []

  for (const item of Object.values(data)) {
    if (item.type !== 'VEVENT') continue

    // Google marks all-day events with a date-only DTSTART (no time).
    const allDay = item.start && item.datetype === 'date'

    if (item.rrule) {
      // Expand recurring events within the requested window.
      const tzid = item.rrule.origOptions?.tzid
      const wall = tzid && !allDay ? zonedParts(tzid, item.start) : null
      const duration = (item.end?.getTime() ?? item.start.getTime()) - item.start.getTime()
      const occurrences = item.rrule.between(rangeStart, rangeEnd, true)
      for (const occ of occurrences) {
        // For timezone-anchored events, rebuild the true instant from the
        // occurrence's local date + the series wall-clock time (see helpers
        // above). Floating/all-day events are already correct.
        const start = wall
          ? zonedToUtc(occ.getUTCFullYear(), occ.getUTCMonth(), occ.getUTCDate(), wall.h, wall.mi, wall.s, tzid)
          : occ
        events.push(
          makeGoogleEvent(cal, item, start, new Date(start.getTime() + duration), allDay, occ),
        )
      }
    } else {
      if (!item.start) continue
      // Skip events fully outside the window.
      if (item.end && item.end < rangeStart) continue
      if (item.start > rangeEnd) continue
      events.push(makeGoogleEvent(cal, item, item.start, item.end, allDay))
    }
  }
  return events
}

function makeGoogleEvent(cal, item, start, end, allDay, occKey) {
  return {
    id: `google-${item.uid}${occKey ? `-${occKey.getTime()}` : ''}`,
    title: item.summary || '(untitled)',
    start: start instanceof Date ? start.toISOString() : start,
    end: end instanceof Date ? end.toISOString() : end,
    allDay,
    source: 'google',
    color: cal.color,
    calendar: cal.name,
  }
}

// ---- Merge + cache ---------------------------------------------------------

const cache = { key: null, at: 0, data: null }
const TTL_MS = 60 * 1000

export async function getEvents(rangeStart, rangeEnd) {
  const key = `${rangeStart.toISOString()}|${rangeEnd.toISOString()}`
  if (cache.data && cache.key === key && Date.now() - cache.at < TTL_MS) {
    return cache.data
  }

  // Fetch both sources independently so one failing doesn't blank the other.
  const [notionRes, googleRes] = await Promise.allSettled([
    fetchNotionEvents(),
    fetchAllGoogleEvents(rangeStart, rangeEnd),
  ])

  const errors = {}
  let events = []
  if (notionRes.status === 'fulfilled') events = events.concat(notionRes.value)
  else errors.notion = String(notionRes.reason?.message || notionRes.reason)
  if (googleRes.status === 'fulfilled') {
    events = events.concat(googleRes.value.events)
    Object.assign(errors, googleRes.value.errors)
  } else {
    errors.google = String(googleRes.reason?.message || googleRes.reason)
  }

  const payload = { events, errors }
  cache.key = key
  cache.at = Date.now()
  cache.data = payload
  return payload
}
