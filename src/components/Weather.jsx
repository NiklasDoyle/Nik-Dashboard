import { useEffect, useState } from 'react'

// Phoenix, AZ
const LAT = 33.4484
const LON = -112.074
const URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m,weather_code,apparent_temperature` +
  `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
  `&temperature_unit=fahrenheit&timezone=America/Phoenix&forecast_days=1`

const REFRESH_MS = 15 * 60 * 1000 // 15 minutes

// Minimal WMO weather-code -> {emoji, label} map.
const WMO = {
  0: ['☀️', 'Clear'],
  1: ['\u{1f324}️', 'Mostly clear'],
  2: ['⛅', 'Partly cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['\u{1f32b}️', 'Fog'],
  48: ['\u{1f32b}️', 'Fog'],
  51: ['\u{1f327}️', 'Drizzle'],
  53: ['\u{1f327}️', 'Drizzle'],
  55: ['\u{1f327}️', 'Drizzle'],
  61: ['\u{1f327}️', 'Rain'],
  63: ['\u{1f327}️', 'Rain'],
  65: ['\u{1f327}️', 'Heavy rain'],
  71: ['\u{1f328}️', 'Snow'],
  73: ['\u{1f328}️', 'Snow'],
  75: ['\u{1f328}️', 'Snow'],
  80: ['\u{1f326}️', 'Showers'],
  81: ['\u{1f326}️', 'Showers'],
  82: ['⛈️', 'Heavy showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm'],
  99: ['⛈️', 'Thunderstorm'],
}

function describe(code) {
  return WMO[code] || ['\u{1f321}️', '']
}

export default function Weather() {
  const [wx, setWx] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(URL)
        const data = await res.json()
        if (alive) {
          setWx(data)
          setErr(null)
        }
      } catch (e) {
        if (alive) setErr(String(e.message || e))
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (err) return <div className="weather weather-error">Weather unavailable</div>
  if (!wx?.current) return <div className="weather">…</div>

  const [emoji, label] = describe(wx.current.weather_code)
  const temp = Math.round(wx.current.temperature_2m)
  const hi = Math.round(wx.daily.temperature_2m_max[0])
  const lo = Math.round(wx.daily.temperature_2m_min[0])

  return (
    <div className="weather">
      <span className="weather-emoji">{emoji}</span>
      <span className="weather-temp">{temp}°</span>
      <span className="weather-meta">
        <span className="weather-label">{label}</span>
        <span className="weather-hilo">
          H {hi}° · L {lo}°
        </span>
      </span>
    </div>
  )
}
