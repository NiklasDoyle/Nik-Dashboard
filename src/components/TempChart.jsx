import { useEffect, useState } from 'react'

// Phoenix, AZ (matches Weather.jsx)
const LAT = 33.4484
const LON = -112.074
// forecast_days=2 so the next 12 hours are available even late in the evening.
const URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m&hourly=temperature_2m` +
  `&temperature_unit=fahrenheit&timezone=America/Phoenix&forecast_days=2`

const REFRESH_MS = 15 * 60 * 1000 // 15 minutes
const HOURS = 12

// "2026-06-15T22:00" -> "10p"
function fmtHour(iso) {
  let h = Number(iso.slice(11, 13))
  const ap = h < 12 ? 'a' : 'p'
  h %= 12
  if (h === 0) h = 12
  return `${h}${ap}`
}

export default function TempChart() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(URL)
        const json = await res.json()
        if (alive) setData(json)
      } catch {
        /* leave previous data in place on a transient failure */
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const allTemps = data?.hourly?.temperature_2m
  const allTimes = data?.hourly?.time
  if (!allTemps?.length) return <div className="temp-chart" />

  // Window = current hour through the next 12 hours.
  let start = allTimes.indexOf(`${data.current.time.slice(0, 13)}:00`)
  if (start < 0) start = 0
  const end = Math.min(allTemps.length, start + HOURS + 1)
  const temps = allTemps.slice(start, end)
  const times = allTimes.slice(start, end)
  const n = temps.length

  const W = 240
  const H = 40
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const span = max - min || 1
  const x = (i) => (i * W) / (n - 1)
  const y = (v) => (1 - (v - min) / span) * H
  const line = temps.map((t, i) => `${x(i)},${y(t)}`).join(' ')
  const area = `M0,${H} L${line} L${W},${H} Z`

  // Ticks every 4 hours (now, +4, +8, +12): temperature above, time below.
  const labels = []
  for (let i = 0; i < n; i += 4) {
    labels.push({ i, time: i === 0 ? 'Now' : fmtHour(times[i]), temp: Math.round(temps[i]) })
  }

  return (
    <div className="temp-chart">
      <div className="temp-vrow">
        <div className="temp-xspacer" />
        <div className="temp-vlabels">
          {labels.map((l) => (
            <span key={l.i}>{l.temp}°</span>
          ))}
        </div>
      </div>
      <div className="temp-top">
        <div className="temp-axis">
          <span>{Math.round(max)}°</span>
          <span>{Math.round(min)}°</span>
        </div>
        <div className="temp-plot">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="temp-chart-svg">
            <path d={area} fill="rgba(245, 166, 35, 0.15)" />
            <polyline
              points={line}
              fill="none"
              stroke="#f5a623"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
      <div className="temp-xrow">
        <div className="temp-xspacer" />
        <div className="temp-xlabels">
          {labels.map((l) => (
            <span key={l.i}>{l.time}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
