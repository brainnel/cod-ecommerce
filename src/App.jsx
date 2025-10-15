import { Routes, Route } from 'react-router-dom'
import { LoadScript } from '@react-google-maps/api'
import HomePage from './pages/HomePage'
import ProductPage from './pages/ProductPage'
import PaymentPage from './pages/PaymentPage'
import OrderSuccessPage from './pages/OrderSuccessPage'
import DownloadPage from './pages/DownloadPage'
import './components/ProductDetail.css'
import './App.css'

const GOOGLE_MAPS_API_KEY = 'AIzaSyDMyVNrUHOluBDieKcsUB53WFrTJtLOVrQ'

function App() {
  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} loadingElement={<div>加载地图...</div>}>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/order-success" element={<OrderSuccessPage />} />
          <Route path="/download" element={<DownloadPage />} />
        </Routes>
      </div>
    </LoadScript>
  )
}

export default App
