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

// One ring per planned run: fills with miles completed toward the planned distance.
function RunRing({ run }) {
  const R = 16
  const C = 2 * Math.PI * R
  const planned = run.miles || 0
  const frac = planned > 0 ? Math.min(1, (run.ran || 0) / planned) : run.done ? 1 : 0
  const day = parseLocal(run.date).toLocaleDateString([], { weekday: 'short' })

  return (
    <div className="run-ring" title={`${run.title} — ${run.ran || 0}/${planned} mi`}>
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
        <span className="run-ring-num">{planned || '—'}</span>
      </div>
      <span className="run-ring-day">{day}</span>
    </div>
  )
}

function StravaBody({ data }) {
  const { race, running, otherWorkouts } = data
  const miles = running?.miles ?? 0
  const planned = running?.plannedMiles ?? 0
  const runs = running?.runs ?? []

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
        {runs.length === 0 ? (
          <span className="agenda-empty">No runs planned this week</span>
        ) : (
          <div className="run-rings">
            {runs.map((r, i) => (
              <RunRing key={`${r.date}-${i}`} run={r} />
            ))}
          </div>
        )}
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
