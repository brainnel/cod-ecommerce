import { useState, useEffect } from 'react'
import './Countdown.css'

const Countdown = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const target = new Date(targetDate).getTime()
      const difference = target - now

      if (difference > 0) {
        const totalHours = Math.floor(difference / (1000 * 60 * 60))
        const hours = totalHours % 24  // 24小时制，超过24小时重新开始
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((difference % (1000 * 60)) / 1000)

        setTimeLeft({ days: 0, hours, minutes, seconds })
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }

    // 立即计算一次
    calculateTimeLeft()
    
    // 每秒更新一次
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [targetDate])

  const formatTime = (time) => {
    return time.toString().padStart(2, '0')
  }

  return (
    <div className="countdown-container">
      <div className="countdown-content">
        <span className="countdown-text">Paiement à la livraison - </span>
        <div className="countdown-timer">
          <div className="time-unit">
            <span className="time-number">{formatTime(timeLeft.hours)}</span>
          </div>
          <span className="time-separator">:</span>
          <div className="time-unit">
            <span className="time-number">{formatTime(timeLeft.minutes)}</span>
          </div>
          <span className="time-separator">:</span>
          <div className="time-unit">
            <span className="time-number">{formatTime(timeLeft.seconds)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Countdown
