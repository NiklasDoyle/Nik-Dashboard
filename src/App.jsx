import { useEffect, useState, useCallback } from 'react'
import Clock from './components/Clock.jsx'
import Weather from './components/Weather.jsx'
import TempChart from './components/TempChart.jsx'
import CalendarView from './components/CalendarView.jsx'
import Agenda from './components/Agenda.jsx'
import Fitness from './components/Fitness.jsx'

const EVENTS_REFRESH_MS = 60 * 1000 // 1 minute

export default function App() {
  const [events, setEvents] = useState([])
  const [errors, setErrors] = useState({})

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events')
      const data = await res.json()
      setEvents(data.events ?? [])
      setErrors(data.errors ?? {})
    } catch (err) {
      setErrors({ fetch: String(err.message || err) })
    }
  }, [])

  useEffect(() => {
    loadEvents()
    const id = setInterval(loadEvents, EVENTS_REFRESH_MS)
    return () => clearInterval(id)
  }, [loadEvents])

  // Double-click anywhere to toggle native browser fullscreen (handy when not
  // launching via kiosk mode).
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }

  return (
    <div className="dashboard" onDoubleClick={toggleFullscreen}>
      <div className="top-half">
        <header className="topbar">
          <Clock />
          <TempChart />
          <Weather />
        </header>

        <section className="calendar-pane">
          <CalendarView events={events} errors={errors} />
        </section>
      </div>

      <section className="agenda-pane">
        <Agenda events={events} />
      </section>

      <section className="fitness-pane">
        <Fitness />
      </section>
    </div>
  )
}
