import { useJsApiLoader } from '@react-google-maps/api'

const GOOGLE_MAPS_API_KEY = 'AIzaSyDMyVNrUHOluBDieKcsUB53WFrTJtLOVrQ'
const LIBRARIES = ['places']

export function useGoogleMaps() {
  return useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  })
}
