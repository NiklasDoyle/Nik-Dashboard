import { useEffect, useState } from 'react'

export default function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="clock">
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date}</div>
    </div>
  )
}
