import { useState, useEffect } from 'react'
import './Countdown.css'

const HOUR_MS = 60 * 60 * 1000
const RANDOM_MIN_MS = 2 * HOUR_MS
const RANDOM_MAX_MS = 8 * HOUR_MS
const COUNTDOWN_STORAGE_KEY = 'brainnel_cod_offer_countdown_deadline_v1'

const createRandomDeadline = () => {
  const randomOffset = RANDOM_MIN_MS + Math.random() * (RANDOM_MAX_MS - RANDOM_MIN_MS)
  return Date.now() + Math.round(randomOffset)
}

const getRandomDeadline = () => {
  if (typeof window === 'undefined') return createRandomDeadline()

  try {
    const storedDeadline = Number(window.localStorage.getItem(COUNTDOWN_STORAGE_KEY))
    const remaining = storedDeadline - Date.now()

    if (
      Number.isFinite(storedDeadline) &&
      remaining > 0 &&
      remaining <= RANDOM_MAX_MS + 5 * 60 * 1000
    ) {
      return storedDeadline
    }

    const nextDeadline = createRandomDeadline()
    window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(nextDeadline))
    return nextDeadline
  } catch (error) {
    console.warn('offer countdown storage unavailable:', error)
    return createRandomDeadline()
  }
}

const getInitialDeadline = (targetDate) => {
  if (targetDate) return new Date(targetDate).getTime()
  return getRandomDeadline()
}

const Countdown = ({ targetDate }) => {
  const [deadline, setDeadline] = useState(() => getInitialDeadline(targetDate))
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })

  useEffect(() => {
    setDeadline(getInitialDeadline(targetDate))
  }, [targetDate])

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      let target = deadline
      const difference = target - now

      if (difference > 0) {
        const totalHours = Math.floor(difference / (1000 * 60 * 60))
        const hours = totalHours % 24  // 24小时制，超过24小时重新开始
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((difference % (1000 * 60)) / 1000)

        setTimeLeft({ days: 0, hours, minutes, seconds })
      } else {
        if (!targetDate) {
          target = createRandomDeadline()
          try {
            window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(target))
          } catch (error) {
            console.warn('offer countdown storage unavailable:', error)
          }
          setDeadline(target)
          return
        }

        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }

    // 立即计算一次
    calculateTimeLeft()
    
    // 每秒更新一次
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [deadline, targetDate])

  const formatTime = (time) => {
    return time.toString().padStart(2, '0')
  }

  return (
    <div className="countdown-container">
      <div className="countdown-content">
        <span className="countdown-kicker">Offre du jour</span>
        <span className="countdown-separator">·</span>
        <div className="countdown-timer" aria-label="Temps restant">
          <span className="time-number">{formatTime(timeLeft.hours)}</span>
          <span className="time-separator">:</span>
          <span className="time-number">{formatTime(timeLeft.minutes)}</span>
          <span className="time-separator">:</span>
          <span className="time-number">{formatTime(timeLeft.seconds)}</span>
        </div>
      </div>
    </div>
  )
}

export default Countdown
