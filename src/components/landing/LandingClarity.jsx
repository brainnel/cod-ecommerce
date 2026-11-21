import { useEffect, useState } from 'react'
import logoImage from '../../assets/logo.png'
import ClarityProductHighlights from './ClarityProductHighlights'
import { CLARITY_DELIVERY_PROMISE } from '../../utils/landingPresentation'
import { getBlackFridayTimeLeft } from '../../utils/blackFriday'
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

// Black Friday offer (utils/blackFriday.js). `offer` is null outside the offer, and every
// element below then renders nothing.
// The saving is shown as an amount, never as a percentage.
const offerSaving = (offer, unit = true) => `−${formatFcfa(offer.saving)}${unit ? '\u00a0FCFA' : ''}`
const twoDigits = (value) => String(value).padStart(2, '0')

const UsualPrice = ({ offer, unit = false }) => (
  <s><span className="clarity-sr">Prix habituel&nbsp;: </span>{formatFcfa(offer.usualPrice)}{unit ? '\u00a0FCFA' : <span className="clarity-sr"> FCFA</span>}</s>
)

// Time left before the offer ends. Renders nothing when there is no time to show.
const OfferTimer = ({ endsAt, placement, visible = true }) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const left = getBlackFridayTimeLeft(endsAt, now)
  if (!left) return null
  if (placement === 'bar') {
    const text = `${left.days}\u00a0j ${twoDigits(left.hours)}\u00a0h ${twoDigits(left.minutes)}\u00a0min ${twoDigits(left.seconds)}\u00a0s`
    return (
      <div className={`clarity-bf-bar-timer${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
        Prix Black Friday&nbsp;: encore <b>{text}</b>
      </div>
    )
  }
  return (
    <div className="clarity-bf-timer">
      <span>Fin de l’offre dans</span>
      <span className="clarity-bf-cells" role="timer">
        <span><b>{twoDigits(left.days)}</b>j</span>
        <span><b>{twoDigits(left.hours)}</b>h</span>
        <span><b>{twoDigits(left.minutes)}</b>min</span>
        <span><b>{twoDigits(left.seconds)}</b>s</span>
      </span>
    </div>
  )
}

// Corner tag on the product gallery.
export const ClarityOfferTag = ({ offer }) => (offer ? (
  <div className="clarity-bf-tag"><span>Black Friday</span><b>{offerSaving(offer)}</b></div>
) : null)

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

export const ClaritySummary = ({ name, price, isBundle = false, highlights, specs, children, offer = null, offerRef }) => {
  return (
    <section className={`clarity-summary${specs ? ' has-specs' : ''}`}>
      {isBundle && <p className="clarity-eyebrow">Le pack complet</p>}
      <h1 className="product-title clarity-title">{name}</h1>
      <ClarityProductHighlights copy={highlights} />
      {offer ? (
        <div className="clarity-bf-panel" ref={offerRef}>
          <div className="clarity-bf-panel-top">
            <div>
              <span className="clarity-bf-label">Prix Black Friday</span>
              <div className="clarity-bf-price">
                <strong>{formatFcfa(price)}</strong><span>FCFA</span>
              </div>
            </div>
            <div className="clarity-bf-saving">
              <UsualPrice offer={offer} unit />
              <b>{offerSaving(offer)}</b>
            </div>
          </div>
          <OfferTimer endsAt={offer.endsAt} placement="panel" />
        </div>
      ) : (
        <div className="clarity-price">
          <strong>{formatFcfa(price)}</strong><span>FCFA</span>
        </div>
      )}
      <div className="clarity-promises">
        <p><LineIcon kind="truck" /><span>{CLARITY_DELIVERY_PROMISE}</span></p>
        <p><LineIcon kind="payment" /><span>Payez à la réception <span className="clarity-payment-options">· Cash ou Wave</span></span></p>
      </div>
      {children && <div className="clarity-options">{children}</div>}
      {specs}
    </section>
  )
}

// Model name and spec lines, folded by default so the detail images come up
// sooner.
export const ClaritySpecs = ({ rows, onOpen }) => {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return (
    <details className="clarity-specs" onToggle={(event) => { if (event.currentTarget.open) onOpen?.() }}>
      <summary>
        <span className="clarity-specs-title">Caractéristiques</span>
      </summary>
      <ul className="clarity-specs-list">
        {rows.map((row, index) => (
          <li key={`${index}-${row.label}`} className={row.label ? '' : 'clarity-spec-note'}>
            {row.label && <span className="clarity-spec-label">{row.label}</span>}
            <span className="clarity-spec-value">{row.value}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

// `price` is the already-calculated payable total from the existing handler.
// Do not multiply again for bundles; quantity is an accessible display hint.
// `showOfferTimer` is true once the price panel has scrolled out of view.
export const ClarityPurchaseBar = ({ price, onOrder, quantity = 1, offer = null, showOfferTimer = false }) => {
  return (
    <div className="clarity-purchase-bar">
      {offer && <OfferTimer endsAt={offer.endsAt} placement="bar" visible={showOfferTimer} />}
      <div className="clarity-purchase-row">
        <div className={`clarity-purchase-price${offer ? ' has-offer' : ''}`}>
          {offer && <span className="clarity-bf-was"><UsualPrice offer={offer} /><b>{offerSaving(offer, false)}</b></span>}
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
