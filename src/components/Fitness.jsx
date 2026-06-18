import { useEffect, useState } from 'react'

const REFRESH_MS = 5 * 60 * 1000 // 5 minutes

const MACROS = [
  { key: 'protein', target: 'targetProtein', label: 'Protein', color: '#4a8cff' },
  { key: 'carbs', target: 'targetCarbs', label: 'Carbs', color: '#37b24d' },
  { key: 'fat', target: 'targetFat', label: 'Fat', color: '#f59f00' },
]

function shortDay(iso) {
  // iso is YYYY-MM-DD; render as a weekday letter without timezone drift.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'narrow' })
}

// Vertical tick labels (top -> bottom) shown to the left of a plot.
function YAxis({ ticks }) {
  return (
    <div className="y-axis">
      {ticks.map((t, i) => (
        <span key={i}>{t}</span>
      ))}
    </div>
  )
}

// Inline SVG line chart of trend weight over the week, with a y-axis.
function WeightChart({ week }) {
  const pts = week.filter((d) => d.trendWeight != null)

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Weight</span>
        {pts.length > 0 && (
          <span className="chart-value">{pts[pts.length - 1].trendWeight.toFixed(1)} lbs</span>
        )}
      </div>
      {pts.length < 2 ? (
        <div className="chart-empty">Not enough weight data</div>
      ) : (
        <WeightPlot pts={pts} />
      )}
    </div>
  )
}

function WeightPlot({ pts }) {
  const W = 100
  const H = 100
  const padX = 3
  const vals = pts.map((d) => d.trendWeight)
  const dataMin = Math.min(...vals)
  const dataMax = Math.max(...vals)
  // Add headroom above and below the data so the line floats off the edges
  // and the axis shows the scale around the values.
  const buffer = (dataMax - dataMin || 1) * 0.25
  const min = dataMin - buffer
  const max = dataMax + buffer
  const span = max - min
  const x = (i) => padX + (i * (W - 2 * padX)) / (pts.length - 1)
  const y = (v) => (1 - (v - min) / span) * H
  const line = pts.map((d, i) => `${x(i)},${y(d.trendWeight)}`).join(' ')

  return (
    <div className="chart-body">
      <YAxis ticks={[max.toFixed(1), ((min + max) / 2).toFixed(1), min.toFixed(1)]} />
      <div className="plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
          <polyline points={line} fill="none" stroke="var(--notion)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Dots are HTML overlays (not SVG) so the non-uniform stretch of the
            chart doesn't squash them into ovals. */}
        {pts.map((d, i) => (
          <span
            key={i}
            className="weight-dot"
            style={{ left: `${x(i)}%`, top: `${y(d.trendWeight)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// Daily calories bar chart with a target reference line and a y-axis. Renders
// the full week including days with no data yet (empty columns), so the chart
// always slides to show the current day.
function CaloriesChart({ week }) {
  const hasData = week.some((d) => d.calories != null)
  // Most recent target in the window (the latest day usually carries it).
  const target = [...week].reverse().find((d) => d.targetCalories != null)?.targetCalories || null

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Calories</span>
        {target && <span className="chart-value">target {target}</span>}
      </div>
      {!hasData ? (
        <div className="chart-empty">No calorie data</div>
      ) : (
        <CaloriesPlot week={week} target={target} />
      )}
    </div>
  )
}

function CaloriesPlot({ week, target }) {
  const dataMax = Math.max(...week.map((d) => d.calories || 0), target || 0)
  // Round the top of the scale up to a clean 500 boundary.
  const axisMax = Math.max(500, Math.ceil(dataMax / 500) * 500)

  return (
    <div className="chart-body chart-body--col">
      <div className="chart-plot-row">
        <YAxis ticks={[axisMax, axisMax / 2, 0]} />
        <div className="cal-tracks">
          {week.map((d, i) => (
            <div
              key={i}
              className="cal-track-col"
              title={d.calories != null ? `${d.date}: ${d.calories} kcal` : `${d.date}: no data`}
            >
              {d.calories != null && (
                <div
                  className="cal-bar-fill"
                  style={{
                    height: `${(d.calories / axisMax) * 100}%`,
                    background: target && d.calories > target ? '#e8590c' : 'var(--accent)',
                  }}
                />
              )}
              {target && <div className="cal-target" style={{ bottom: `${(target / axisMax) * 100}%` }} />}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-x-row">
        <div className="y-spacer" />
        <div className="cal-labels">
          {week.map((d, i) => (
            <span key={i}>{shortDay(d.date)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function MacroBar({ label, value, target, color }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0
  return (
    <div className="macro">
      <div className="macro-head">
        <span className="macro-label">{label}</span>
        <span className="macro-nums">
          {value ?? 0}
          {target ? ` / ${target} g` : ' g'}
        </span>
      </div>
      <div className="macro-track">
        <div className="macro-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function CalorieRing({ value, target }) {
  const R = 52
  const C = 2 * Math.PI * R
  const pct = target ? Math.min(1, value / target) : 0
  const over = target && value > target

  return (
    <div className="cal-ring">
      <div className="cal-ring-inner">
        <svg viewBox="0 0 120 120" className="cal-ring-svg">
          <circle className="cal-ring-track" cx="60" cy="60" r={R} />
          <circle
            className="cal-ring-fill"
            cx="60"
            cy="60"
            r={R}
            stroke={over ? '#e8590c' : 'var(--notion)'}
            style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }}
          />
        </svg>
        <div className="cal-ring-center">
          <span className="cal-big">{value}</span>
          <span className="cal-target-label">{target ? `/ ${target} kcal` : 'kcal'}</span>
        </div>
      </div>
    </div>
  )
}

function TodaySummary({ today }) {
  if (!today) return null

  return (
    <div className="today-fit">
      <CalorieRing value={today.calories ?? 0} target={today.targetCalories} />
      <div className="macros">
        {MACROS.map((m) => (
          <MacroBar
            key={m.key}
            label={m.label}
            value={today[m.key]}
            target={today[m.target]}
            color={m.color}
          />
        ))}
      </div>
    </div>
  )
}

export default function Fitness() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/fitness')
        const json = await res.json()
        if (alive) setData(json)
      } catch (err) {
        if (alive) setData({ error: String(err.message || err), week: [], today: null })
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!data) return <div className="fitness fitness-msg">Loading fitness…</div>

  const noData = !data.today && (!data.week || data.week.length === 0)
  if (noData) {
    return (
      <div className="fitness fitness-msg">
        {data.error === 'No MacroFactor export found'
          ? 'Drop a MacroFactor export (.xlsx) into the data/ folder'
          : `Fitness data unavailable: ${data.error || 'unknown error'}`}
      </div>
    )
  }

  return (
    <div className="fitness">
      <div className="fitness-charts">
        <WeightChart week={data.week} />
        <CaloriesChart week={data.week} />
      </div>
      <div className="fitness-today">
        <h3 className="fitness-today-title">Today</h3>
        <TodaySummary today={data.today} />
      </div>
    </div>
  )
}
