import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ProductPage from './pages/ProductPage'
import PaymentPage from './pages/PaymentPage'
import OrderSuccessPage from './pages/OrderSuccessPage'
import './components/ProductDetail.css'
import './App.css'

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/order-success" element={<OrderSuccessPage />} />
      </Routes>
    </div>
  )
}

export default App
