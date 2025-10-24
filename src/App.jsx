import { Routes, Route } from 'react-router-dom'
import { LoadScript } from '@react-google-maps/api'
import HomePage from './pages/HomePage'
import ProductPage from './pages/ProductPage'
import PaymentPage from './pages/PaymentPage'
import OrderSuccessPage from './pages/OrderSuccessPage'
import DownloadPage from './pages/DownloadPage'
import UpdateAddress from './pages/UpdateAddress'
import './components/ProductDetail.css'
import './App.css'

const GOOGLE_MAPS_API_KEY = 'AIzaSyDMyVNrUHOluBDieKcsUB53WFrTJtLOVrQ'

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={
          <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} loadingElement={<div>加载地图...</div>}>
            <HomePage />
          </LoadScript>
        } />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/payment" element={
          <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} loadingElement={<div>加载地图...</div>}>
            <PaymentPage />
          </LoadScript>
        } />
        <Route path="/order-success" element={<OrderSuccessPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/update-address" element={<UpdateAddress />} />
      </Routes>
    </div>
  )
}

export default App
