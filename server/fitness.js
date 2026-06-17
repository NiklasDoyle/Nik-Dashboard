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

// Cache keyed by file path + mtime — only re-parse when the newest file changes.
const cache = { key: null, data: null }

export async function getFitness() {
  const newest = await findNewestExport()
  if (!newest) {
    return { sourceFile: null, fileModified: null, days: [], week: [], today: null, error: 'No MacroFactor export found' }
  }

  const key = `${newest.path}|${newest.mtimeMs}`
  if (cache.key === key && cache.data) return cache.data

  try {
    const days = await parseExport(newest.path)
    const payload = {
      sourceFile: newest.file,
      fileModified: new Date(newest.mtimeMs).toISOString(),
      days,
      week: days.slice(-7),
      today: days.length ? days[days.length - 1] : null,
      error: null,
    }
    cache.key = key
    cache.data = payload
    return payload
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
