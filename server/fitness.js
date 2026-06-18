import fs from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'

const MACROFACTOR_DIR = process.env.MACROFACTOR_DIR || './data'
const SHEET_NAME = 'Quick Export'

// Map the JSON field we want -> the MacroFactor column header.
const COLUMNS = {
  date: 'Date',
  trendWeight: 'Trend Weight (lbs)',
  weight: 'Weight (lbs)',
  calories: 'Calories (kcal)',
  protein: 'Protein (g)',
  fat: 'Fat (g)',
  carbs: 'Carbs (g)',
  targetCalories: 'Target Calories (kcal)',
  targetProtein: 'Target Protein (g)',
  targetFat: 'Target Fat (g)',
  targetCarbs: 'Target Carbs (g)',
}

// Excel stores dates as a serial day count. 25569 = days between Excel's epoch
// (1899-12-30) and the Unix epoch (1970-01-01).
function excelSerialToISO(serial) {
  const ms = (serial - 25569) * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

// The Date column may come back as a JS Date (exceljs auto-converts
// date-formatted cells) or as a raw serial number.
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const n = Number(typeof v === 'object' && v.result !== undefined ? v.result : v)
  return Number.isFinite(n) ? excelSerialToISO(n) : null
}

function cellNumber(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'object' && v.result !== undefined ? v.result : v
  const num = Number(n)
  return Number.isFinite(num) ? num : null
}

// Find the most recently modified .xlsx in the data folder.
async function findNewestExport() {
  let entries
  try {
    entries = await fs.readdir(MACROFACTOR_DIR)
  } catch {
    return null
  }
  const xlsx = entries.filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
  let newest = null
  for (const file of xlsx) {
    const full = path.join(MACROFACTOR_DIR, file)
    const stat = await fs.stat(full)
    if (!newest || stat.mtimeMs > newest.mtimeMs) {
      newest = { path: full, file, mtimeMs: stat.mtimeMs }
    }
  }
  return newest
}

async function parseExport(filePath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.getWorksheet(SHEET_NAME)
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found`)

  // Build a header-name -> column-number map from row 1.
  const headerRow = ws.getRow(1)
  const colIndex = {}
  headerRow.eachCell((cell, colNumber) => {
    colIndex[String(cell.value).trim()] = colNumber
  })

  const get = (row, field) => {
    const col = colIndex[COLUMNS[field]]
    return col ? row.getCell(col).value : null
  }

  const days = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const date = parseDate(get(row, 'date'))
    if (date === null) continue // skip rows without a date
    days.push({
      date,
      trendWeight: cellNumber(get(row, 'trendWeight')),
      weight: cellNumber(get(row, 'weight')),
      calories: cellNumber(get(row, 'calories')),
      protein: cellNumber(get(row, 'protein')),
      fat: cellNumber(get(row, 'fat')),
      carbs: cellNumber(get(row, 'carbs')),
      targetCalories: cellNumber(get(row, 'targetCalories')),
      targetProtein: cellNumber(get(row, 'targetProtein')),
      targetFat: cellNumber(get(row, 'targetFat')),
      targetCarbs: cellNumber(get(row, 'targetCarbs')),
    })
  }

  // Ensure chronological order (oldest -> newest).
  days.sort((a, b) => a.date.localeCompare(b.date))
  return days
}

// ---- "Logical day" helpers -------------------------------------------------

// Local YYYY-MM-DD (matches MacroFactor's per-day date strings).
function localDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The dashboard's day doesn't roll over until 2 AM local time: late-night hours
// (e.g. 1 AM) still count as the previous day, but from 2 AM on the new calendar
// day becomes "today" — even before any data has been logged for it.
function logicalTodayISO(now = new Date()) {
  return localDateISO(new Date(now.getTime() - 2 * 60 * 60 * 1000))
}

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return localDateISO(new Date(y, m - 1, d + n))
}

// Most recent day on or before `iso` that carries macro targets, so empty days
// (including a not-yet-logged today) still show the goal you're aiming for.
function targetsAsOf(days, iso) {
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].date <= iso && days[i].targetCalories != null) return days[i]
  }
  return null
}

function emptyDay(date, targets) {
  return {
    date,
    trendWeight: null,
    weight: null,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    targetCalories: targets?.targetCalories ?? null,
    targetProtein: targets?.targetProtein ?? null,
    targetFat: targets?.targetFat ?? null,
    targetCarbs: targets?.targetCarbs ?? null,
  }
}

// A continuous 7-day window ending on `todayISO`. Days with no export row
// (gaps, or the current day before data arrives) are filled with empty entries
// so the charts always slide to include today.
function buildWeek(days, byDate, todayISO) {
  const start = addDaysISO(todayISO, -6)
  const week = []
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(start, i)
    week.push(byDate.get(iso) || emptyDay(iso, targetsAsOf(days, iso)))
  }
  return week
}

// Cache the *parsed* days keyed by file path + mtime — only re-parse when the
// newest file changes. The day-window/today derivation runs on every call so it
// stays correct as the clock rolls past the 2 AM boundary without a new file.
const cache = { key: null, days: null }

export async function getFitness() {
  const newest = await findNewestExport()
  if (!newest) {
    return { sourceFile: null, fileModified: null, days: [], week: [], today: null, error: 'No MacroFactor export found' }
  }

  const key = `${newest.path}|${newest.mtimeMs}`
  let days
  if (cache.key === key && cache.days) {
    days = cache.days
  } else {
    try {
      days = await parseExport(newest.path)
      cache.key = key
      cache.days = days
    } catch (err) {
      return {
        sourceFile: newest.file,
        fileModified: new Date(newest.mtimeMs).toISOString(),
        days: [],
        week: [],
        today: null,
        error: String(err.message || err),
      }
    }
  }

  const todayISO = logicalTodayISO()
  const byDate = new Map(days.map((d) => [d.date, d]))
  // When today's data hasn't arrived yet, reset to an empty day (counters at 0)
  // while still showing the carried-forward targets.
  const today = days.length ? byDate.get(todayISO) || emptyDay(todayISO, targetsAsOf(days, todayISO)) : null

  return {
    sourceFile: newest.file,
    fileModified: new Date(newest.mtimeMs).toISOString(),
    days,
    week: buildWeek(days, byDate, todayISO),
    today,
    error: null,
  }
}
