// Keep this classifier in parity with app_admin/app/utils/delivery_area.py.
// Only high-confidence destinations block checkout; landmarks remain allowed.
export const DELIVERY_AREA_RULE_VERSION = 'non_abidjan_context_2026_10_07'

const EXPLICIT_OUTSIDE_PATTERNS = [
  /\bhors\b.*\babidjan\b/,
  /\bnon\s+abidjan\b/,
  /\bpas\s+a\s+abidjan\b/,
  /\bpas\s+abidjan\b/
]

const CITY_PATTERNS = [
  ['San Pedro', /\bsan\s+pedro\b/g],
  ['Korhogo', /\bkorhogo\b/g],
  ['Bouaké', /\bbouake\b/g],
  ['Yamoussoukro', /\byamoussoukro\b/g],
  ['Daloa', /\bdaloa\b/g],
  ['Gagnoa', /\bgagnoa\b/g],
  ['Abengourou', /\babengourou\b/g],
  ['Soubré', /\bsoubre\b/g],
  ['Sinfra', /\bsinfra\b/g],
  ['Man', /\bman\b/g],
  ['Bondoukou', /\bbondoukou\b/g],
  ['Odienné', /\bodienne\b/g],
  ['Séguéla', /\bseguela\b/g],
  ['Ferkessédougou', /\bferkessedougou\b/g],
  ['Tiassalé', /\btiassale\b/g],
  ['Agnibilékrou', /\bagnibilekrou\b|\bagnoibilekrou\b/g],
  ['Agboville', /\bagboville\b|\bagbovilla\b/g],
  ['Dimbokro', /\bdimbokro\b/g],
  ['Jacqueville', /\bjacqueville\b/g],
  ['Aboisso', /\baboisso\b/g],
  ['Grand-Lahou', /\bgrand\s+lahou\b|\birobo\b/g],
  ['Guiglo', /\bguiglo\b/g],
  ['Azaguié', /\bazaguie\b/g],
  ['Duékoué', /\bduekoue\b/g],
  ['Daoukro', /\bdaoukro\b/g],
  ['Toumodi', /\btoumodi\b/g],
  ['Sassandra', /\bsassandra\b/g],
  ['Adzopé', /\badzope\b/g],
  ['Dabou', /\bdabou\b/g],
  ['Divo', /\bdivo\b/g],
  ['Bonoua', /\bbonoua\b/g],
  ['Assinie', /\bassini\w*\b/g]
]

const REFERENCE_PREFIX = /(?:(?:route|rue|avenue|boulevard|carrefour)(?:\s+de)?|gare(?:\s+[a-z0-9]+){0,3}|station(?:\s+[a-z0-9]+){0,3}|quartier|marche|cite|ancien(?:ne)?|ex(?:\s+rue)?|en\s+allant\s+a|direction)\s*$/
const REFERENCE_SUFFIX = /^\s*(?:gare|station|transport|carrefour|route|rue)\b/
const DESTINATION_PREFIX = /(?:^|\s)(?:expedition(?:\s+(?:pour|sur))?|livrer(?:\s+la\s+commande)?(?:\s+a)?|livraison(?:\s+a)?|je\s+suis(?:\s+precisement)?(?:\s+a)?|suis(?:\s+precisement)?(?:\s+a)?|dans(?:\s+la\s+region\s+de)?|pour|ville\s+de)\s*$/
const CONTEXT_SENSITIVE_CITIES = new Set(['Dabou', 'Divo', 'Jacqueville'])
const LOCAL_COMPOUND_LOCATION = /\b(?:[mn]\s+batto|[mn]batto)\s+bouake\b/g
const LOCAL_DISTRICT = /\b(?:adjame|yopougon|abobo|cocody|marcory|koumassi|treichville|bingerville|anyama)\b/
const LOCAL_TRANSPORT_PREFIX = /\bsbta\s*$/

export const normalizeDeliveryAreaText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .toLowerCase()
  .trim()
  .replace(/\s+/g, ' ')

const classifyCityMatch = (text, match, location, selectedSubarea, field) => {
  const before = text.slice(0, match.index).trimEnd()
  const after = text.slice(match.index + match[0].length).trimStart()
  const evidence = (confidence, reason) => ({ location, confidence, reason, field })

  if (location === 'Bouaké' && [...text.matchAll(LOCAL_COMPOUND_LOCATION)].some(local => (
    local.index <= match.index && match.index < local.index + local[0].length
  ))) return evidence('ambiguous', 'matched_abidjan_compound_location')

  if (LOCAL_DISTRICT.test(before) && LOCAL_TRANSPORT_PREFIX.test(before)) {
    return evidence('ambiguous', 'local_transport_station_context')
  }

  if (selectedSubarea.includes(normalizeDeliveryAreaText(match[0]))) {
    return evidence('ambiguous', 'matched_selected_subarea')
  }
  if (!before) return evidence('high', 'city_at_address_start')
  if (REFERENCE_PREFIX.test(before) || REFERENCE_SUFFIX.test(after)) {
    if (before === 'quartier' && !CONTEXT_SENSITIVE_CITIES.has(location)) {
      return evidence('high', 'short_quartier_with_city')
    }
    return evidence('ambiguous', 'road_station_or_landmark_context')
  }
  if (text.split(' ').length <= 4 && !CONTEXT_SENSITIVE_CITIES.has(location)) {
    return evidence('high', 'short_address_with_city')
  }
  if (before === 'a') return evidence('high', 'explicit_a_city_destination')
  if (DESTINATION_PREFIX.test(before)) return evidence('high', 'explicit_destination_phrase')
  return evidence('ambiguous', 'city_mentioned_without_destination_context')
}

export const classifyCheckoutDeliveryArea = (address, context = {}) => {
  const selectedSubarea = normalizeDeliveryAreaText(context.selectedSubarea)
  const fields = [
    ['receiver_address', normalizeDeliveryAreaText(address)],
    ['buyer_message', normalizeDeliveryAreaText(context.buyerMessage)]
  ]
  for (const [field, text] of fields) {
    if (text && EXPLICIT_OUTSIDE_PATTERNS.some(pattern => pattern.test(text))) {
      return { location: 'hors Abidjan', confidence: 'high', reason: 'explicit_outside_abidjan_phrase', field }
    }
  }

  let firstHigh = null
  let firstAmbiguous = null
  for (const [field, text] of fields) {
    if (!text) continue
    for (const [location, pattern] of CITY_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const evidence = classifyCityMatch(text, match, location, selectedSubarea, field)
        const candidate = { index: match.index, evidence }
        if (evidence.confidence === 'high') {
          if (!firstHigh || candidate.index < firstHigh.index) firstHigh = candidate
        } else if (!firstAmbiguous || candidate.index < firstAmbiguous.index) {
          firstAmbiguous = candidate
        }
      }
    }
  }
  return firstHigh?.evidence || firstAmbiguous?.evidence || null
}

export const validateCheckoutDeliveryArea = (address, context = {}) => {
  const evidence = classifyCheckoutDeliveryArea(address, context)
  if (evidence?.confidence !== 'high') return { isValid: true, reason: '', error: '' }
  const message = evidence.location === 'hors Abidjan'
    ? 'Cette adresse semble être hors de nos zones de livraison.'
    : `Nous ne livrons pas encore à ${evidence.location}.`
  return {
    isValid: false,
    reason: 'outside_delivery_area',
    error: `${message} Indiquez une adresse dans l’une de nos zones de livraison.`,
    matchedLocation: evidence.location,
    matchReason: evidence.reason,
    ruleVersion: DELIVERY_AREA_RULE_VERSION
  }
}
