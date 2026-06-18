import { useEffect, useState } from 'react'

const REFRESH_MS = 5 * 60 * 1000 // 5 minutes

function parseLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function RaceProgress({ race }) {
  const start = parseLocal(race.start)
  const end = parseLocal(race.date)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const total = end - start
  const pct = total > 0 ? Math.max(0, Math.min(1, (today - start) / total)) : 0
  const daysToGo = Math.max(0, Math.round((end - today) / 86400000))
  const label = end.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div className="race">
      <div className="race-head">
        <span className="strava-section-label">Race day · {label}</span>
        <span className="race-days">{daysToGo}d</span>
      </div>
      <div className="macro-track">
        <div className="macro-fill" style={{ width: `${pct * 100}%`, background: 'var(--notion)' }} />
      </div>
    </div>
  )
}

const fmtMiles = (m) => (Number.isInteger(m) ? String(m) : m.toFixed(1))

// One ring per weekday. Empty days show an outline; runs fill the ring with
// miles ran toward the planned distance (or fully, for unplanned runs that
// still logged Strava miles).
function DayRing({ day }) {
  const R = 16
  const C = 2 * Math.PI * R
  const planned = day.plannedMiles || 0
  const ran = day.ranMiles || 0
  const frac = planned > 0 ? Math.min(1, ran / planned) : ran > 0 ? 1 : 0
  const num = planned > 0 ? fmtMiles(planned) : ran > 0 ? fmtMiles(ran) : '—'
  const weekday = parseLocal(day.date).toLocaleDateString([], { weekday: 'short' })
  const title =
    planned > 0 || ran > 0 ? `${weekday}: ${fmtMiles(ran)}/${fmtMiles(planned)} mi` : `${weekday}: no run`

  return (
    <div className="run-ring" title={title}>
      <div className="run-ring-circle">
        <svg viewBox="0 0 36 36" className="run-ring-svg">
          <circle className="run-ring-track" cx="18" cy="18" r={R} />
          <circle
            className="run-ring-fill"
            cx="18"
            cy="18"
            r={R}
            stroke="var(--notion)"
            style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }}
          />
        </svg>
        <span className="run-ring-num">{num}</span>
      </div>
      <span className="run-ring-day">{weekday}</span>
    </div>
  )
}

function StravaBody({ data }) {
  const { race, running, otherWorkouts } = data
  const miles = running?.miles ?? 0
  const planned = running?.plannedMiles ?? 0
  const days = running?.days ?? []

  return (
    <div className="strava">
      {race?.date && <RaceProgress race={race} />}

      <div className="strava-miles">
        <div className="strava-miles-head">
          <span className="strava-section-label">This week's runs</span>
          <span className="strava-miles-planned">
            {miles.toFixed(1)} / {planned.toFixed(0)} mi
          </span>
        </div>
        <div className="run-rings">
          {days.map((d) => (
            <DayRing key={d.date} day={d} />
          ))}
        </div>
      </div>

      <div className="strava-other">
        <div className="strava-section-label">Other workouts</div>
        {otherWorkouts.length === 0 ? (
          <span className="agenda-empty">None yet this week</span>
        ) : (
          <div className="strava-chips">
            {otherWorkouts.map((o) => (
              <span key={o.label} className="chip" style={{ background: o.color }}>
                {o.label}
                {o.count > 1 ? ` ×${o.count}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Strava() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/strava')
        const json = await res.json()
        if (alive) setData(json)
      } catch {
        /* keep previous data on a transient failure */
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="agenda-col strava-box">
      <h3 className="agenda-col-title">Strava</h3>
      {!data ? <p className="agenda-empty">Loading…</p> : <StravaBody data={data} />}
    </div>
  )
}
