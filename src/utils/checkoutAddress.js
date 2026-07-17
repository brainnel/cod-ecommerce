const MIN_ADDRESS_LENGTH = 5

const INVALID_ADDRESS_MESSAGE = 'Indiquez une adresse de livraison claire : quartier et repère connu.'
const SHORT_ADDRESS_MESSAGE = 'Ajoutez au moins 5 caractères : quartier ou repère connu.'

const NOISE_PHRASES = new Set([
  'allo',
  'aucun',
  'bonjour',
  'bonne journee',
  'bonsoir',
  'bjr',
  'bsr',
  'coucou',
  'hello',
  'address',
  'adresse',
  'abcdefj',
  'azrety',
  'je ne sais pas',
  'jsp',
  'lol',
  'mdr',
  'merci',
  'merci beaucoup',
  'neant',
  'non',
  'offline',
  'ok',
  'okay',
  'oui',
  'ras',
  'rien',
  'salut',
  'sorry',
  'suffit',
  'test',
  'testing',
  'mot de passe',
  'password',
  'qwerty',
  'zerty'
])

const NOISE_WORDS = new Set([
  'aucun', 'bonjour', 'bonsoir', 'bjr', 'bsr', 'hello', 'merci', 'neant',
  'non', 'ok', 'okay', 'oui', 'ras', 'rien', 'salut', 'test'
])

const KEYBOARD_GIBBERISH = new Set([
  'abcde',
  'abcdef',
  'abcdefgh',
  'asdfgh',
  'azert',
  'azerty',
  'azertyuiop',
  'blabla',
  'hahaha',
  'lalala',
  'qwert',
  'qwerty',
  'qwertyuiop'
])

// Learned from words inside historical, structured Cote d'Ivoire delivery addresses.
const COMMON_ADDRESS_BIGRAMS = new Set(`^a ^b ^c ^d ^e ^f ^g ^h ^i ^j ^k ^l ^m ^n ^o ^p ^q ^r ^s ^t ^u ^v ^w ^y ^z a$ ab ac ad ae af ag ah ai ak al am an ao ap aq ar as at au av ay az b$ ba be bi bl bo br bu c$ ca ce ch ci ck cl co ct cu d$ da de di dj do dr du dy e$ ea eb ec ed ee ef eg eh ei el em en ep er es et eu ev ex ez f$ fa fe fi fo fr g$ ga gb ge gi gl gn go gr gu h$ ha he hi ho hu hv i$ ia ib ic id ie ig ik il im in io ip iq ir is it iv ix ja je ji jo ju k$ ka ke ki ko ku l$ la le li ll lm lo lu ly m$ ma mb me mi mm mo mp mu n$ na nc nd ne ng ni nk nn no np nq nr ns nt nu ny nz o$ oa ob oc od og oi ok ol om on oo op or os ot ou ow p$ pa pe ph pi pl po pp pr ps qu r$ ra rc rd re rg ri rl rm rn ro rr rs rt ru rv ry s$ sa sc se sh si so sp sq ss st su sy t$ ta te th ti to tr ts tt tu u$ ua ub uc ud ue ug ui ul um un up ur us ut uv ux va ve vi vo vr wa we x$ y$ ya yc yo z$ za zi zo`.split(' '))

const GIBBERISH_ALLOWLIST = new Set([
  'abdoulaye', 'abdouy', 'abijne', 'addhoa', 'adjawi', 'adjouffou', 'akekro',
  'akoxi', 'akwaba', 'awaqa', 'ayaza',
  'aljdme', 'andriyn', 'azaguoe', 'baouht', 'bekhoujoel', 'blaukhaus', 'bouabfle',
  'boufle', 'boyka', 'briggs', 'citydia', 'cpfae', 'cyclisme', 'daoukro', 'diekoye',
  'dinbokro', 'douekeoue', 'edwige', 'ekresinville', 'fohgoro', 'framework',
  'freeword', 'galaxy', 'gohitafla', 'gozaq', 'gozee', 'hamedyalcouye', 'hygiene',
  'jacqiueville',
  'johnny', 'koffi', 'koffikro', 'kohrogo', 'koewet', 'koloko', 'konhdo',
  'korhgo', 'korhpgo', 'korohgo', 'kouamekro', 'koumzssi', 'maxime', 'pyramide',
  'lifetv', 'porboye', 'prlkro', 'pythagore', 'redovno', 'seydou', 'sisley',
  'skyrock', 'supmarket', 'sylvie', 'synaccasi', 'tekni', 'tight', 'trehcvill',
  'uniwax', 'wifia', 'wilfried', 'williamsville', 'williamsvilleh', 'windows',
  'yamssoukro', 'yetaabou', 'zerbo', 'zoukro', 'zuonula'
])

export const normalizeCheckoutAddressText = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
)

const addressWords = (value) => normalizeCheckoutAddressText(value).split(' ').filter(Boolean)

const isRepeatedPattern = (compact) => {
  if (compact.length < 3) return false
  if (/^(.)\1{2,}$/.test(compact)) return true
  if (/^(.{1,3})\1{2,}$/.test(compact)) return true
  return KEYBOARD_GIBBERISH.has(compact)
}

const alphaAddressWords = (value) => (
  normalizeCheckoutAddressText(value).replace(/[^a-z]+/g, ' ').trim().split(/\s+/).filter(Boolean)
)

const gibberishShapeScore = (word) => {
  const length = word.length
  const counts = new Map()
  for (const char of word) counts.set(char, (counts.get(char) || 0) + 1)

  const vowelRatio = [...word].filter(char => 'aeiou'.includes(char)).length / length
  const rareRatio = [...word].filter(char => 'jkwxyzv'.includes(char)).length / length
  const dominantRatio = Math.max(...counts.values()) / length
  const consonantRuns = word.match(/[bcdfghjklmnpqrstvwxyz]+/g) || []
  const maxConsonantRun = Math.max(0, ...consonantRuns.map(run => run.length))

  let score = 0
  if (vowelRatio <= 0.18 || vowelRatio >= 0.68) score += 1
  if (maxConsonantRun >= 4) score += 1
  if (rareRatio >= 0.30) score += 1
  if (dominantRatio >= 0.50) score += 1
  if (counts.size <= 3 && length >= 7) score += 1
  return score
}

const isLikelySingleWordGibberish = (raw) => {
  const words = alphaAddressWords(raw)
  if (words.length !== 1) return false

  const word = words[0]
  if (word.length < 5 || word.length > 24 || GIBBERISH_ALLOWLIST.has(word)) return false

  const padded = `^${word}$`
  let uncommonTransitions = 0
  for (let index = 0; index < padded.length - 1; index += 1) {
    if (!COMMON_ADDRESS_BIGRAMS.has(padded.slice(index, index + 2))) uncommonTransitions += 1
  }

  const uncommonRatio = uncommonTransitions / (padded.length - 1)
  return gibberishShapeScore(word) >= 2 || uncommonRatio >= 0.20
}

export const validateCheckoutAddress = (value, context = {}) => {
  const raw = String(value || '').trim()
  const normalized = normalizeCheckoutAddressText(raw)
  const words = addressWords(raw)
  const compact = words.join('')
  const fullName = normalizeCheckoutAddressText(context.fullName)
  const fullNameCompact = fullName.replace(/[^a-z0-9]/g, '')
  const phoneDigits = String(context.phone || '').replace(/\D/g, '')
  const addressDigits = raw.replace(/\D/g, '')
  const letters = normalized.replace(/[^a-z]/g, '')

  if (!raw) {
    return { isValid: false, reason: 'required', error: SHORT_ADDRESS_MESSAGE }
  }

  if (!normalized) {
    return { isValid: false, reason: 'symbols_only', error: INVALID_ADDRESS_MESSAGE }
  }

  if (compact.length < MIN_ADDRESS_LENGTH) {
    return { isValid: false, reason: 'too_short', error: SHORT_ADDRESS_MESSAGE }
  }

  if (/[\w.+-]+@[\w.-]+(?:\.[a-z]{2,})?/i.test(raw) || raw.includes('@')) {
    return { isValid: false, reason: 'email_or_handle', error: INVALID_ADDRESS_MESSAGE }
  }

  if (/^(?:https?:\/\/|www\.|wa\.me\/|(?:facebook|instagram|tiktok)\.com)\S*$/i.test(raw) || /^[@#][a-z0-9_.-]+$/i.test(raw)) {
    return { isValid: false, reason: 'url_or_social', error: INVALID_ADDRESS_MESSAGE }
  }

  if (phoneDigits.length >= 6 && addressDigits === phoneDigits && !/[a-z]/i.test(raw)) {
    return { isValid: false, reason: 'same_as_phone', error: INVALID_ADDRESS_MESSAGE }
  }

  if (/^[\d\s+().,/#-]+$/.test(raw)) {
    return { isValid: false, reason: 'numbers_only', error: INVALID_ADDRESS_MESSAGE }
  }

  if (fullNameCompact && compact.length >= 5 && compact === fullNameCompact) {
    return { isValid: false, reason: 'same_as_name', error: INVALID_ADDRESS_MESSAGE }
  }

  if (String(context.fullName || '').includes('@')) {
    const nameEmailPrefix = normalizeCheckoutAddressText(String(context.fullName).split('@', 1)[0]).replace(/[^a-z0-9]/g, '')
    if (nameEmailPrefix && compact === nameEmailPrefix) {
      return { isValid: false, reason: 'same_as_name_email_prefix', error: INVALID_ADDRESS_MESSAGE }
    }
  }

  if (words.length >= 3 && words.every(word => word.length === 1)) {
    return { isValid: false, reason: 'isolated_letters', error: INVALID_ADDRESS_MESSAGE }
  }

  if ((raw.match(/\d+/g) || []).some(part => part.length >= 8) && letters.length <= 3) {
    return { isValid: false, reason: 'phone_or_number_dominates', error: INVALID_ADDRESS_MESSAGE }
  }

  const digitCount = [...compact].filter(char => /\d/.test(char)).length
  if (words.length <= 2 && digitCount >= 4 && letters.length >= 3) {
    const looksMixedGarbage = /^\d{4,}/.test(compact) || !/[aeiou]/.test(letters) || /[bcdfghjklmnpqrstvwxyz]{4,}/.test(letters)
    if (looksMixedGarbage) {
      return { isValid: false, reason: 'alphanumeric_gibberish', error: INVALID_ADDRESS_MESSAGE }
    }
  }

  if (isRepeatedPattern(compact)) {
    return { isValid: false, reason: 'repeated_or_gibberish', error: INVALID_ADDRESS_MESSAGE }
  }

  if (NOISE_PHRASES.has(normalized) || (words.length > 0 && words.every(word => NOISE_WORDS.has(word)))) {
    return { isValid: false, reason: 'greeting_or_noise', error: INVALID_ADDRESS_MESSAGE }
  }

  if (isLikelySingleWordGibberish(raw)) {
    return { isValid: false, reason: 'single_word_gibberish', error: INVALID_ADDRESS_MESSAGE }
  }

  return { isValid: true, reason: '', error: '' }
}

export const isValidCheckoutAddress = (value, context = {}) => (
  validateCheckoutAddress(value, context).isValid
)
