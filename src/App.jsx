import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ProductPage from './pages/ProductPage'
import './components/ProductDetail.css'
import './App.css'

const BundlePage = lazy(() => import('./pages/BundlePage'))
const PaymentPage = lazy(() => import('./pages/PaymentPage'))
const OrderSuccessPage = lazy(() => import('./pages/OrderSuccessPage'))
const DownloadPage = lazy(() => import('./pages/DownloadPage'))
const UpdateAddress = lazy(() => import('./pages/UpdateAddress'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))
const TermsOfUsePage = lazy(() => import('./pages/TermsOfUsePage'))

const routeFallback = (
  <div className="loading-container">
    <div className="loading-spinner"></div>
    <p>Chargement...</p>
  </div>
)

function App() {
  return (
    <div className="App">
      <Suspense fallback={routeFallback}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="/bundle/:bundleId" element={<BundlePage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/order-success" element={<OrderSuccessPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/update-address" element={<UpdateAddress />} />
          <Route path="/address/:orderNo" element={<UpdateAddress />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-use" element={<TermsOfUsePage />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
