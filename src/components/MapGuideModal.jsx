import { useEffect } from 'react'
import fingerImage from '../assets/guide/finger.png'
import pointImage from '../assets/guide/point.png'
import mapImage from '../assets/guide/map.png'
import './MapGuideModal.css'

const MapGuideModal = ({ visible, onClose, autoCloseMs = 2200 }) => {
  useEffect(() => {
    if (!visible) return undefined

    const timer = setTimeout(() => {
      onClose()
    }, autoCloseMs)

    return () => clearTimeout(timer)
  }, [autoCloseMs, onClose, visible])

  if (!visible) return null

  return (
    <div className="map-guide-overlay" onClick={onClose}>
      <div className="map-guide-container">
        <div className="map-guide-content">
          <img src={mapImage} alt="Map" className="guide-map-image" />
          
          <img 
            src={fingerImage} 
            alt="Finger" 
            className="guide-finger-image animate-finger" 
          />
          
          <img 
            src={pointImage} 
            alt="Point" 
            className="guide-point-image animate-point" 
          />
        </div>
        
        <div className="guide-tip-container">
          <div className="guide-tip-text">
            Choisissez votre position sur la carte
          </div>
        </div>
      </div>
    </div>
  )
}

export default MapGuideModal
