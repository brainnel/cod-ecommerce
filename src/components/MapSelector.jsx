import { useState, useCallback, useEffect } from 'react'
import { GoogleMap, Marker } from '@react-google-maps/api'

const MapSelector = ({ center, zoom = 13, onMarkerSet, customMarker, userLocation }) => {
  const [map, setMap] = useState(null)
  const [currentZoom, setCurrentZoom] = useState(zoom)

  const mapContainerStyle = {
    width: '100%',
    height: '100%',
  }

  const onLoad = useCallback((map) => {
    setMap(map)
  }, [])
  
  // 当center或zoom改变时，自动将地图移动到新中心点
  useEffect(() => {
    if (map && center) {
      map.panTo(center)
      if (zoom !== currentZoom) {
        map.setZoom(zoom)
        setCurrentZoom(zoom)
      }
    }
  }, [map, center, zoom, currentZoom])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  // 处理地图点击
  const handleMapClick = useCallback((event) => {
    const lat = event.latLng.lat()
    const lng = event.latLng.lng()
    
    console.log('地图点击:', { lat, lng })
    
    if (onMarkerSet) {
      onMarkerSet({ lat, lng })
    }
  }, [onMarkerSet])

  const defaultOptions = {
    zoomControl: true,
    mapTypeControl: false,
    scaleControl: false,
    streetViewControl: false,
    rotateControl: false,
    fullscreenControl: false,
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ]
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={zoom}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={handleMapClick}
      options={defaultOptions}
    >
      {/* 用户当前位置标记（蓝色圆点） */}
      {userLocation && (
        <Marker
          position={{ lat: userLocation.lat, lng: userLocation.lng }}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }}
          title="Votre position actuelle"
        />
      )}
      
      {/* 用户选择的位置标记（红色图钉） */}
      {customMarker && (
        <Marker
          position={{ lat: customMarker.lat, lng: customMarker.lng }}
          icon={{
            url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
            scaledSize: new window.google.maps.Size(40, 40)
          }}
          title="Position de livraison"
        />
      )}
    </GoogleMap>
  )
}

export default MapSelector
