import { useCallback, useEffect, useRef, useState } from 'react'
import { getCheckoutPricing } from '../utils/qtyOffer'
import { getCheckoutQuantityLimit } from '../utils/checkoutQuantity'
import './QtyOfferModal.css'

// Quantity-discount popup (件数优化, arm B): design B "三列价格卡" of
// output/quantity-discount-modal/index.html. Mounted when opened; the default choice is 1.
const QUANTITIES = [1, 2, 3]
const CLOSE_MS = 260

const formatFcfa = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)
const pieces = (n) => (n === 1 ? '1 pièce' : `${n} pièces`)

const tagFor = (quantity, pct) => {
  if (quantity === 1) return { label: 'Standard', tone: '' }
  if (quantity === 2) return pct ? { label: 'Recommandé', tone: 'hot' } : { label: 'Duo', tone: '' }
  return pct ? { label: 'Meilleur prix', tone: 'best' } : { label: 'Trio', tone: '' }
}

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12h15M13 5l7 7-7 7" />
  </svg>
)
const TagIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
)

const QtyOfferModal = ({ product, offerArm, onSelect, onConfirm, onClose }) => {
  const [quantity, setQuantity] = useState(1)
  const [closing, setClosing] = useState(false)
  const tileRefs = useRef({})
  const closeTimerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Same cap as the checkout page's stepper, so a tier offered here is never clamped there.
  const limit = getCheckoutQuantityLimit(product)
  const tiers = QUANTITIES.map((n) => ({ n, ...getCheckoutPricing(product, n, offerArm), disabled: n > limit }))
  const selected = tiers.find((tier) => tier.n === quantity) || tiers[0]
  const image = Array.isArray(product?.image_url) ? product.image_url[0] : product?.image_url

  const close = useCallback(() => {
    if (closeTimerRef.current) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current?.(), CLOSE_MS)
  }, [])

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    tileRefs.current[1]?.focus({ preventScroll: true })
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      window.clearTimeout(closeTimerRef.current)
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true })
    }
  }, [close])

  const choose = (n, { focus = false } = {}) => {
    const tier = tiers.find((item) => item.n === n)
    if (!tier || tier.disabled) return
    if (focus) tileRefs.current[n]?.focus()
    if (n === quantity) return
    setQuantity(n)
    onSelect?.(n)
  }

  // Arrow keys move the choice between the available tiles (radio group pattern).
  const handleTileKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const enabled = tiers.filter((tier) => !tier.disabled).map((tier) => tier.n)
    const index = enabled.indexOf(quantity)
    const next = enabled[(index + step + enabled.length) % enabled.length]
    if (next) choose(next, { focus: true })
  }

  const handleConfirm = () => {
    if (closing || selected.disabled) return
    onConfirm?.(selected.n)
  }

  return (
    <div className={`qo-overlay${closing ? ' closing' : ''}`} onClick={close}>
      <div
        className="qo-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qo-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qo-grab" aria-hidden="true" />
        <button type="button" className="qo-close" aria-label="Fermer" onClick={close}><CloseIcon /></button>
        <h3 className="qo-title" id="qo-title">Combien en voulez-vous ?</h3>
        <p className="qo-sub">Une seule livraison, gratuite, pour toute la commande</p>

        <div className="qo-tiles" role="radiogroup" aria-label="Quantité">
          {tiers.map((tier) => {
            const tag = tagFor(tier.n, tier.pct)
            const isSelected = tier.n === quantity
            return (
              <button
                key={tier.n}
                ref={(node) => { tileRefs.current[tier.n] = node }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${pieces(tier.n)}, ${formatFcfa(tier.total)} FCFA${tier.disabled ? ', épuisé' : tier.pct ? `, -${tier.pct} %` : ''}`}
                tabIndex={isSelected ? 0 : -1}
                disabled={tier.disabled}
                className={`qo-tile${isSelected ? ' is-selected' : ''}`}
                onClick={() => choose(tier.n)}
                onKeyDown={handleTileKeyDown}
              >
                <span className={`qo-tag${tag.tone ? ` ${tag.tone}` : ''}`}>{tag.label}</span>
                <span className="qo-stack" aria-hidden="true">
                  {image && Array.from({ length: tier.n }, (_, i) => {
                    const d = i - (tier.n - 1) / 2
                    return (
                      <img
                        key={i}
                        src={image}
                        alt=""
                        decoding="async"
                        style={{
                          transform: `translateX(calc(-50% + ${d * 18}px)) rotate(${d * 9}deg)`,
                          zIndex: i === Math.floor(tier.n / 2) ? 3 : 1
                        }}
                      />
                    )
                  })}
                </span>
                <span className="qo-qty">×{tier.n}</span>
                <span className="qo-total">{formatFcfa(tier.total)}<small>FCFA</small></span>
                <span className="qo-unit">
                  {tier.disabled ? 'Épuisé' : tier.pct ? `${formatFcfa(tier.unitPrice)} / pièce` : 'Prix normal'}
                </span>
                <span className={`qo-off${tier.pct ? '' : ' empty'}`}>{tier.pct ? `-${tier.pct}%` : '—'}</span>
                <span className="qo-check"><CheckIcon /></span>
              </button>
            )
          })}
        </div>

        <div className="qo-sum">
          <div>
            <span className="qo-label">Total · {pieces(selected.n)}</span>
            {selected.saved > 0 && <s>{formatFcfa(selected.fullTotal)} FCFA</s>}
          </div>
          <strong aria-live="polite">{formatFcfa(selected.total)} <small>FCFA</small></strong>
        </div>
        {selected.saved > 0 && (
          <div className="qo-chip"><TagIcon /> Vous économisez <b>{formatFcfa(selected.saved)}</b> FCFA</div>
        )}
        <button type="button" className="qo-cta" onClick={handleConfirm}>Continuer <ArrowIcon /></button>
      </div>
    </div>
  )
}

export default QtyOfferModal
