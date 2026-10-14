import logoImage from '../../assets/logo.png'
import { CLARITY_DELIVERY_PROMISE, getLandingReferencePrice } from '../../utils/landingPresentation'
import './LandingClarity.css'

const formatFcfa = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)
    : '—'
}

const LineIcon = ({ kind, className = '' }) => {
  const paths = {
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>
  }
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

export const ClarityHeader = ({ onHome }) => (
  <header className="clarity-header">
    <div className="clarity-header-inner">
      <button type="button" className="clarity-brand" onClick={onHome} aria-label="Brainnel, accueil">
        <img src={logoImage} alt="" width="32" height="32" />
        <span>brainnel<span className="clarity-brand-dot">.</span></span>
      </button>
      <span className="clarity-location"><LineIcon kind="pin" /> Livraison à Abidjan</span>
    </div>
  </header>
)

export const ClaritySummary = ({ name, price, referencePrice, isBundle = false, children }) => {
  const comparisonPrice = getLandingReferencePrice(price, referencePrice)
  return (
    <section className="clarity-summary">
      {isBundle && <p className="clarity-eyebrow">Le pack complet</p>}
      <h1 className="product-title clarity-title">{name}</h1>
      <div className="clarity-price">
        <strong>{formatFcfa(price)}</strong><span>FCFA</span>
        {comparisonPrice !== null && <div className="clarity-reference-price">
          <span>{isBundle ? 'Achetés séparément' : 'Référence indicative'}</span>
          <s>{formatFcfa(comparisonPrice)} FCFA</s>
        </div>}
      </div>
      <div className="clarity-promises">
        <p><LineIcon kind="truck" /><span>{CLARITY_DELIVERY_PROMISE}</span></p>
        <p><LineIcon kind="payment" /><span>Payez à la réception <span className="clarity-payment-options">· Cash ou Wave</span></span></p>
      </div>
      {children && <div className="clarity-options">{children}</div>}
    </section>
  )
}

// `price` is the already-calculated payable total from the existing handler.
// Do not multiply again for bundles; quantity is an accessible display hint.
export const ClarityPurchaseBar = ({ price, onOrder, quantity = 1 }) => {
  return (
    <div className="clarity-purchase-bar">
      <div className="clarity-purchase-row">
        <div className="clarity-purchase-price">
          <strong>{formatFcfa(price)} <span>FCFA</span></strong>
          <span>Paiement à la livraison</span>
        </div>
        <button type="button" className="buy-now-btn clarity-order-button" onClick={onOrder} aria-label={`Commander${quantity > 1 ? ` · ${quantity} unités` : ''} · ${formatFcfa(price)} FCFA`}>
          Commander <LineIcon kind="arrow" />
        </button>
      </div>
    </div>
  )
}

export const ClarityAftercare = () => (
  <section className="clarity-aftercare" aria-label="Livraison et paiement">
    <p className="clarity-eyebrow">Bon à savoir</p>
    <h2>Votre commande, simplement.</h2>
    <details>
      <summary>Où et quand livrez-vous ?</summary>
      <p>{CLARITY_DELIVERY_PROMISE}. Le livreur vous appelle avant de passer pour confirmer votre disponibilité et votre adresse.</p>
    </details>
    <details>
      <summary>Quand dois-je payer ?</summary>
      <p>Vous payez à la réception, en cash ou par Wave. Aucun paiement n’est demandé maintenant.</p>
    </details>
    <details>
      <summary>Comment le livreur me retrouve-t-il ?</summary>
      <p>Indiquez votre commune et un repère près de chez vous lors de la commande. Le livreur vous contacte par téléphone avant la livraison.</p>
    </details>
  </section>
)

export const ClarityReviews = ({ reviews }) => {
  const suppliedReviews = Array.isArray(reviews)
    ? reviews.map((review) => ({
      id: review?.id,
      name: review?.name || review?.customer_name,
      text: review?.text || review?.content || review?.comment
    })).filter((review) => typeof review.text === 'string' && review.text.trim())
    : []
  if (!suppliedReviews.length) return null
  return (
    <section className="clarity-reviews" aria-label="Avis clients">
      <h2>Avis clients</h2>
      {suppliedReviews.map((review, index) => (
        <figure key={review.id || `${index}-${review.text}`}>
          <blockquote>{review.text}</blockquote>
          <figcaption>{typeof review.name === 'string' && review.name.trim() ? review.name : 'Client'}</figcaption>
        </figure>
      ))}
    </section>
  )
}
