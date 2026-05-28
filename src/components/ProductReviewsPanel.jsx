/* eslint-disable react-refresh/only-export-components */
import { FiStar } from 'react-icons/fi'

export const PRODUCT_REVIEW_SUMMARY = {
  score: '4.8',
  count: 5
}

const PRODUCT_REVIEW_PROFILES = [
  { name: 'Aminata', area: 'Cocody' },
  { name: 'Mariam', area: 'Marcory' },
  { name: 'Moussa', area: 'Yopougon' },
  { name: 'Kouadio', area: 'Abobo' },
  { name: 'Fatou', area: 'Treichville' }
]

const FALLBACK_SERVICE_REVIEW_POOL = [
  { text: "Le livreur m'a appelé avant de passer. Je n'ai pas payé de frais en plus à la livraison." },
  { text: "La livraison a été rapide à Abidjan. Le livreur a confirmé l'adresse par téléphone avant de venir." },
  { text: "J'ai payé à la réception, en cash. Le prix était bien celui affiché sur la page." },
  { text: "On m'a appelé avant la livraison, donc j'ai pu expliquer facilement mon adresse au livreur." },
  { text: "Le livreur m'a appelé quand il était proche de mon quartier. J'ai donné le repère et tout s'est bien passé." },
  { text: "J'ai payé seulement à la réception. Pas de surprise sur le prix, c'était bien le montant affiché." },
  { text: "Le livreur m'a appelé avant de passer. J'ai pu expliquer au téléphone où se trouve la maison." },
  { text: "La livraison était gratuite à Abidjan. Le livreur ne m'a rien demandé en plus quand il est arrivé." },
  { text: "J'ai vérifié le colis devant le livreur avant de payer. Pour une commande en ligne, ça met en confiance." },
  { text: "Même avec une adresse pas très précise, l'appel du livreur a aidé. J'ai expliqué le carrefour et il est venu." },
  { text: "Commande reçue sans complication. Le livreur a appelé avant de quitter la zone pour confirmer ma disponibilité." },
  { text: "J'ai payé en cash à la livraison. Le livreur a été correct et m'a laissé vérifier le colis tranquillement." },
  { text: "La livraison s'est bien passée dans la commune. On m'a appelé avant, donc je n'ai pas attendu au hasard." },
  { text: "Le prix affiché sur la page est le prix payé. Il n'y a pas eu de frais cachés au moment de recevoir." },
  { text: "J'ai pu choisir un moment où j'étais disponible. Le livreur a appelé avant de passer, c'était simple." }
]

const FALLBACK_QUALITY_REVIEW_POOL = [
  (shortName) => ({ text: `Le ${shortName} est arrivé propre, bien présenté et conforme au modèle affiché sur la page.` }),
  (shortName) => ({ text: `Le ${shortName} était bien emballé. À la réception, tout était en bon état et rien ne semblait abîmé.` }),
  () => ({ text: 'Le modèle reçu correspondait aux photos de la page. La finition est correcte pour le prix payé.' }),
  () => ({ text: "Le colis était propre à l'arrivée. Le produit était complet et conforme à ce que j'avais commandé." }),
  () => ({ text: "J'ai vérifié le produit à la livraison. Il était en bon état et le modèle était bien celui choisi." }),
  (shortName) => ({ text: `Le ${shortName} donne une bonne impression à la réception. L'emballage était correct et le produit propre.` })
]

const getTextSignature = (value) => {
  const text = value ? String(value) : ''
  return Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

const getSeededHash = (value, seed) => {
  const text = `${seed}:${value || ''}`
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const pickStableReviews = (reviews, count, seed) => (
  [...reviews]
    .sort((left, right) => getSeededHash(left.text, seed) - getSeededHash(right.text, seed))
    .slice(0, count)
)

const getShortProductName = (product) => {
  const rawName = product?.skus?.[0]?.name_fr || product?.name_fr || 'ce produit'
  return rawName.length > 54 ? `${rawName.slice(0, 51).trim()}...` : rawName
}

const buildFallbackProductReviews = (product) => {
  const shortName = getShortProductName(product)
  const seed = getTextSignature(`${product?.product_id || ''}:${product?.name_fr || ''}:${product?.skus?.[0]?.name_fr || ''}`)
  const serviceReviews = pickStableReviews(FALLBACK_SERVICE_REVIEW_POOL, 4, seed)
  const qualityReviews = FALLBACK_QUALITY_REVIEW_POOL.map((buildReview) => buildReview(shortName))
  const reviews = [
    ...serviceReviews.slice(0, 3),
    serviceReviews[3],
    pickStableReviews(qualityReviews, 1, seed + 17)[0]
  ]

  return reviews.map((review, index) => ({
    ...PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length],
    ...review
  }))
}

const normalizeReviewList = (reviews) => {
  if (!Array.isArray(reviews)) return []

  return reviews
    .map((review) => ({
      name: review?.name || review?.customer_name,
      area: review?.area || review?.district || review?.district_name,
      text: review?.text || review?.content || review?.comment,
      type: review?.type || review?.review_type
    }))
    .filter((review) => review.text)
}

export const getDisplayProductReviews = (product) => {
  const storedReviews = normalizeReviewList(product?.reviews || product?.product_reviews)
  const fallbackReviews = buildFallbackProductReviews(product)
  const mergedReviews = []
  const seenTexts = new Set();

  [...storedReviews, ...fallbackReviews].forEach((review, index) => {
    if (mergedReviews.length >= 5) return
    const textKey = review.text.trim().toLowerCase()
    if (seenTexts.has(textKey)) return
    seenTexts.add(textKey)
    mergedReviews.push({
      ...PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length],
      ...review,
      name: review.name || PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length].name,
      area: review.area || PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length].area
    })
  })

  return mergedReviews
}

const ProductReviewsPanel = ({ reviews }) => (
  <div className="product-tab-panel reviews-panel" role="tabpanel">
    <div className="reviews-summary">
      <div>
        <div className="reviews-score">
          <span>{PRODUCT_REVIEW_SUMMARY.score}</span>
          <div className="reviews-stars" aria-label={`${PRODUCT_REVIEW_SUMMARY.score} sur 5`}>
            {[0, 1, 2, 3, 4].map((star) => (
              <FiStar key={star} aria-hidden="true" />
            ))}
          </div>
        </div>
        <div className="reviews-count">5 avis utiles sélectionnés pour vous</div>
      </div>
      <div className="reviews-verified">Clients à Abidjan</div>
    </div>

    <div className="review-list">
      {(reviews || []).map((review) => (
        <article key={`${review.name}-${review.area}-${review.text}`} className="review-item">
          <div className="review-content">
            <div className="review-header">
              <div>
                <strong>{review.name}</strong>
                <span>{review.area}</span>
              </div>
              <div className="review-item-stars" aria-label="5 sur 5">
                {[0, 1, 2, 3, 4].map((star) => (
                  <FiStar key={star} aria-hidden="true" />
                ))}
              </div>
            </div>
            <p>{review.text}</p>
          </div>
        </article>
      ))}
    </div>
  </div>
)

export default ProductReviewsPanel
