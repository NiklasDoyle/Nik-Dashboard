import Strava from './Strava.jsx'

function localYMD(d) {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  )
}

// All-day events arrive as a date-only string ("2026-06-15") or a UTC-midnight
// ISO string. Parsing those through Date shifts them a day in negative-offset
// timezones (e.g. Phoenix), so compare the calendar-date portion directly.
// Timed events compare by their local date.
function isToday(ev) {
  const todayStr = localYMD(new Date())
  if (ev.allDay && typeof ev.start === 'string') {
    return ev.start.slice(0, 10) === todayStr
  }
  return localYMD(new Date(ev.start)) === todayStr
}

function formatTime(ev) {
  if (ev.allDay) return 'All day'
  return new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// One property row: "Key  [chip] [chip]" — colored chips for select/status/
// tags, plain text for numbers/dates/text.
function Detail({ detail }) {
  return (
    <div className="workout-detail">
      <span className="workout-detail-key">{detail.key}</span>
      <span className="workout-detail-values">
        {detail.values.map((v, i) =>
          v.color ? (
            <span key={i} className="chip" style={{ background: v.color }}>
              {v.text}
            </span>
          ) : (
            <span key={i} className="workout-detail-text">
              {v.text}
            </span>
          ),
        )}
      </span>
    </div>
  )
}

function Section({ title, items, showDetails = false, showCalendar = false }) {
  return (
    <div className="agenda-section">
      <h3 className="agenda-col-title">{title}</h3>
      {items.length === 0 ? (
        <p className="agenda-empty">Nothing scheduled.</p>
      ) : (
        <ul className="agenda-list">
          {items.map((ev) => (
            <li key={ev.id} className="agenda-item">
              <div className="agenda-item-head">
                <span className="agenda-dot" style={{ background: ev.color }} />
                <span className="agenda-time">{formatTime(ev)}</span>
                <span className="agenda-name">{ev.title}</span>
                {showCalendar && ev.calendar && (
                  <span className="agenda-cal">{ev.calendar}</span>
                )}
              </div>
              {showDetails && ev.details?.length > 0 && (
                <div className="workout-details">
                  {ev.details.map((d) => (
                    <Detail key={d.key} detail={d} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Agenda({ events }) {
  const today = (events ?? [])
    .filter((e) => isToday(e))
    .sort((a, b) => new Date(a.start) - new Date(b.start))

  // To-dos come from Google Calendar; workouts from Notion.
  const todos = today.filter((e) => e.source === 'google')
  const workouts = today.filter((e) => e.source === 'notion')

  // Only label calendars when more than one is in play, to avoid noise.
  const multipleCals = new Set(todos.map((e) => e.calendar).filter(Boolean)).size > 1

  return (
    <div className="agenda">
      <h2 className="agenda-title">Today</h2>
      <div className="agenda-cols">
        <div className="agenda-col">
          <Section title="To-dos" items={todos} showCalendar={multipleCals} />
          <Section title="Workouts" items={workouts} showDetails />
        </div>
        <Strava />
      </div>
    </div>
  )
}
