import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'

export default function CalendarView({ events, errors }) {
  const hasErrors = errors && Object.keys(errors).length > 0

  return (
    <div className="calendar-view">
      {hasErrors && (
        <div className="calendar-errors">
          {Object.entries(errors).map(([src, msg]) => (
            <span key={src} className="calendar-error">
              {src}: {msg}
            </span>
          ))}
        </div>
      )}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
        initialView="dayGridMonth"
        height="100%"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek',
        }}
        events={events}
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        nowIndicator
        dayMaxEventRows={4}
        firstDay={0}
      />
    </div>
  )
}
