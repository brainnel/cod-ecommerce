import { Component } from 'react'
import { useLocation } from 'react-router-dom'
import { trackCheckoutEvent } from '../services/checkoutFunnelAnalytics'
import './RouteRecoveryBoundary.css'

class RecoveryBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    const isChunk = /chunk|dynamically imported|module script|Loading CSS/i.test(String(error?.message || ''))
    try { trackCheckoutEvent(isChunk ? 'checkout_chunk_load_failed' : 'checkout_route_render_failed', { route: this.props.routeKind }) } catch { /* non-blocking */ }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="route-recovery" role="alert">
      <h1>La page n’a pas pu se charger</h1>
      <p>Vérifiez votre connexion, puis réessayez. Vos informations déjà enregistrées restent sur cet appareil.</p>
      <button type="button" onClick={() => {
        try { trackCheckoutEvent('checkout_route_reload_click', { route: this.props.routeKind }) } catch { /* non-blocking */ }
        // Manual only: no automatic reload loop, no storage clearing and no order retry.
        window.location.reload()
      }}>Réessayer</button>
      <a href="/">Retour aux produits</a>
    </main>
  }
}

export default function RouteRecoveryBoundary({ children }) {
  const { pathname } = useLocation()
  const routeKind = pathname.startsWith('/product/') ? 'product' : pathname.startsWith('/bundle/') ? 'bundle' : pathname.split('/')[1] || 'home'
  return <RecoveryBoundary key={pathname} routeKind={routeKind}>{children}</RecoveryBoundary>
}
