import { fold } from './text'
import type { Lang } from './types'

/**
 * Common crops with local names. `keys` are lowercase, letters-only prefixes matched against
 * Agmarknet commodity names (which vary, e.g. "Paddy(Dhan)(Common)", "Cucumbar(Kheera)").
 * Keys shorter than 5 letters ("tur", "lime") must be the name's whole first word, so "Turnip" isn't Red Gram.
 */
export interface Commodity {
  id: string
  keys: string[]
  names: Record<Lang, string>
  /** Agmarknet names containing any of these (letters only) are a different product: "Banana Leaf", "Mangosteen". */
  exclude?: string[]
}

const c = (
  id: string,
  keys: string[],
  hi: string,
  te: string,
  ta: string,
  kn: string,
  ml: string,
  opts: { en?: string; exclude?: string[] } = {},
): Commodity => ({ id, keys, names: { en: opts.en ?? id, hi, te, ta, kn, ml }, ...(opts.exclude ? { exclude: opts.exclude } : {}) })

export const COMMODITIES: Commodity[] = [
  c('Tomato', ['tomato'], 'टमाटर', 'టమాటా', 'தக்காளி', 'ಟೊಮ್ಯಾಟೊ', 'തക്കാളി'),
  c('Onion', ['onion'], 'प्याज', 'ఉల్లిపాయ', 'வெங்காயம்', 'ಈರುಳ್ಳಿ', 'സവാള'),
  c('Spring onion', ['oniongreen', 'springonion'], 'हरा प्याज', 'ఉల్లికాడలు', 'வெங்காயத்தாள்', 'ಈರುಳ್ಳಿ ಸೊಪ್ಪು', 'ഉള്ളിത്തണ്ട്'),
  c('Potato', ['potato'], 'आलू', 'బంగాళాదుంప', 'உருளைக்கிழங்கு', 'ಆಲೂಗಡ್ಡೆ', 'ഉരുളക്കിഴങ്ങ്'),
  c('Brinjal', ['brinjal'], 'बैंगन', 'వంకాయ', 'கத்தரிக்காய்', 'ಬದನೆಕಾಯಿ', 'വഴുതനങ്ങ'),
  c('Green Chilli', ['greenchil'], 'हरी मिर्च', 'పచ్చి మిరపకాయ', 'பச்சை மிளகாய்', 'ಹಸಿ ಮೆಣಸಿನಕಾಯಿ', 'പച്ചമുളക്'),
  c('Dry Chillies', ['drychil', 'chilired', 'redchil'], 'सूखी लाल मिर्च', 'ఎండు మిరపకాయ', 'காய்ந்த மிளகாய்', 'ಒಣ ಮೆಣಸಿನಕಾಯಿ', 'ഉണക്കമുളക്'),
  c('Capsicum', ['capsicum'], 'शिमला मिर्च', 'క్యాప్సికమ్', 'குடைமிளகாய்', 'ದೊಣ್ಣೆ ಮೆಣಸಿನಕಾಯಿ', 'കാപ്സിക്കം'),
  c('Cabbage', ['cabbage'], 'पत्ता गोभी', 'క్యాబేజీ', 'முட்டைக்கோஸ்', 'ಎಲೆಕೋಸು', 'കാബേജ്'),
  c('Cauliflower', ['cauliflower'], 'फूल गोभी', 'కాలీఫ్లవర్', 'காலிஃபிளவர்', 'ಹೂಕೋಸು', 'കോളിഫ്ലവർ'),
  c('Carrot', ['carrot'], 'गाजर', 'క్యారెట్', 'கேரட்', 'ಗಜ್ಜರಿ', 'കാരറ്റ്'),
  c('Beetroot', ['beetroot'], 'चुकंदर', 'బీట్‌రూట్', 'பீட்ரூட்', 'ಬೀಟ್‌ರೂಟ್', 'ബീറ്റ്റൂട്ട്'),
  c('Radish', ['raddish', 'radish'], 'मूली', 'ముల్లంగి', 'முள்ளங்கி', 'ಮೂಲಂಗಿ', 'റാഡിഷ്'),
  c('Bhindi', ['bhindi', 'ladiesfinger'], 'भिंडी', 'బెండకాయ', 'வெண்டைக்காய்', 'ಬೆಂಡೆಕಾಯಿ', 'വെണ്ടയ്ക്ക', { en: 'Bhindi (Okra)' }),
  c('Beans', ['beans'], 'बीन्स', 'బీన్స్', 'பீன்ஸ்', 'ಬೀನ್ಸ್', 'ബീൻസ്'),
  c('Cucumber', ['cucumbar', 'cucumber'], 'खीरा', 'దోసకాయ', 'வெள்ளரிக்காய்', 'ಸೌತೆಕಾಯಿ', 'വെള്ളരിക്ക'),
  c('Bitter gourd', ['bittergourd'], 'करेला', 'కాకరకాయ', 'பாகற்காய்', 'ಹಾಗಲಕಾಯಿ', 'പാവയ്ക്ക'),
  c('Bottle gourd', ['bottlegourd'], 'लौकी', 'సొరకాయ', 'சுரைக்காய்', 'ಸೋರೆಕಾಯಿ', 'ചുരയ്ക്ക'),
  c('Ridge gourd', ['ridgeguard', 'ridgegourd'], 'तोरई', 'బీరకాయ', 'பீர்க்கங்காய்', 'ಹೀರೆಕಾಯಿ', 'പീച്ചിങ്ങ'),
  c('Snake gourd', ['snakeguard', 'snakegourd'], 'चिचिंडा', 'పొట్లకాయ', 'புடலங்காய்', 'ಪಡವಲಕಾಯಿ', 'പടവലങ്ങ'),
  c('Pumpkin', ['pumpkin'], 'कद्दू', 'గుమ్మడికాయ', 'பூசணிக்காய்', 'ಕುಂಬಳಕಾಯಿ', 'മത്തങ്ങ'),
  c('Drumstick', ['drumstick'], 'सहजन', 'మునగకాయ', 'முருங்கைக்காய்', 'ನುಗ್ಗೆಕಾಯಿ', 'മുരിങ്ങക്കായ'),
  c('Coriander leaves', ['corianderleave', 'corianderleaf'], 'हरा धनिया', 'కొత్తిమీర', 'கொத்தமல்லி இலை', 'ಕೊತ್ತಂಬರಿ ಸೊಪ್ಪು', 'മല്ലിയില'),
  c('Garlic', ['garlic'], 'लहसुन', 'వెల్లుల్లి', 'பூண்டு', 'ಬೆಳ್ಳುಳ್ಳಿ', 'വെളുത്തുള്ളി'),
  c('Ginger', ['ginger'], 'अदरक', 'అల్లం', 'இஞ்சி', 'ಶುಂಠಿ', 'ഇഞ്ചി', { exclude: ['dry', 'seed'] }),
  c('Dry Ginger', ['gingerdry', 'dryginger'], 'सोंठ', 'శొంఠి', 'சுக்கு', 'ಒಣ ಶುಂಠಿ', 'ചുക്ക്'),
  c('Tapioca', ['tapioca'], 'टैपिओका', 'కర్రపెండలం', 'மரவள்ளிக்கிழங்கு', 'ಮರಗೆಣಸು', 'കപ്പ'),
  c('Sweet Potato', ['sweetpotato'], 'शकरकंद', 'చిలగడదుంప', 'சர்க்கரைவள்ளிக்கிழங்கு', 'ಸಿಹಿ ಗೆಣಸು', 'മധുരക്കിഴങ്ങ്'),
  c('Banana', ['banana'], 'केला', 'అరటి పండు', 'வாழைப்பழம்', 'ಬಾಳೆಹಣ್ಣು', 'വാഴപ്പഴം', { exclude: ['leaf', 'flower', 'stem'] }),
  c('Raw Banana', ['bananagreen'], 'कच्चा केला', 'పచ్చి అరటి', 'வாழைக்காய்', 'ಬಾಳೆಕಾಯಿ', 'പച്ചക്കായ'),
  c('Mango', ['mango'], 'आम', 'మామిడి', 'மாம்பழம்', 'ಮಾವು', 'മാങ്ങ', { exclude: ['steen'] }),
  c('Papaya', ['papaya'], 'पपीता', 'బొప్పాయి', 'பப்பாளி', 'ಪಪ್ಪಾಯ', 'പപ്പായ'),
  c('Pomegranate', ['pomegranate'], 'अनार', 'దానిమ్మ', 'மாதுளை', 'ದಾಳಿಂಬೆ', 'മാതളം'),
  c('Grapes', ['grapes'], 'अंगूर', 'ద్రాక్ష', 'திராட்சை', 'ದ್ರಾಕ್ಷಿ', 'മുന്തിരി'),
  c('Guava', ['guava'], 'अमरूद', 'జామ', 'கொய்யா', 'ಸೀಬೆ', 'പേരയ്ക്ക'),
  c('Sapota', ['chikoo', 'sapota'], 'चीकू', 'సపోటా', 'சப்போட்டா', 'ಸಪೋಟ', 'സപ്പോട്ട', { en: 'Sapota (Chikoo)' }),
  c('Watermelon', ['watermelon'], 'तरबूज', 'పుచ్చకాయ', 'தர்பூசணி', 'ಕಲ್ಲಂಗಡಿ', 'തണ്ണിമത്തൻ'),
  c('Lemon', ['lemon', 'lime'], 'नींबू', 'నిమ్మకాయ', 'எலுமிச்சை', 'ನಿಂಬೆಹಣ್ಣು', 'നാരങ്ങ', { exclude: ['grass'] }),
  c('Tamarind', ['tamarind'], 'इमली', 'చింతపండు', 'புளி', 'ಹುಣಸೆಹಣ್ಣು', 'പുളി', { exclude: ['seed'] }),
  c('Tamarind seed', ['tamarindseed'], 'इमली के बीज', 'చింత గింజలు', 'புளியங்கொட்டை', 'ಹುಣಸೆ ಬೀಜ', 'പുളിങ്കുരു'),
  c('Coconut', ['coconut'], 'नारियल', 'కొబ్బరి', 'தேங்காய்', 'ತೆಂಗಿನಕಾಯಿ', 'തേങ്ങ', { exclude: ['coir', 'seed'] }),
  c('Copra', ['copra'], 'खोपरा', 'కొప్పెర', 'கொப்பரை', 'ಕೊಬ್ಬರಿ', 'കൊപ്ര'),
  c('Arecanut', ['arecanut', 'betelnut'], 'सुपारी', 'వక్క', 'பாக்கு', 'ಅಡಿಕೆ', 'അടയ്ക്ക'),
  c('Betel leaf', ['betelvine', 'betelleaf'], 'पान', 'తమలపాకు', 'வெற்றிலை', 'ವೀಳ್ಯದೆಲೆ', 'വെറ്റില'),
  c('Cashewnut', ['cashewnut'], 'काजू', 'జీడిపప్పు', 'முந்திரி', 'ಗೋಡಂಬಿ', 'കശുവണ്ടി'),
  c('Black pepper', ['blackpepper', 'pepper'], 'काली मिर्च', 'మిరియాలు', 'மிளகு', 'ಕಾಳುಮೆಣಸು', 'കുരുമുളക്'),
  c('Cardamom', ['cardamom'], 'इलायची', 'యాలకులు', 'ஏலக்காய்', 'ಏಲಕ್ಕಿ', 'ഏലം'),
  c('Turmeric', ['turmeric'], 'हल्दी', 'పసుపు', 'மஞ்சள்', 'ಅರಿಶಿನ', 'മഞ്ഞൾ'),
  c('Coffee', ['coffee'], 'कॉफ़ी', 'కాఫీ', 'காபி', 'ಕಾಫಿ', 'കാപ്പി'),
  c('Rubber', ['rubber'], 'रबड़', 'రబ్బరు', 'ரப்பர்', 'ರಬ್ಬರ್', 'റബ്ബർ'),
  c('Paddy', ['paddy'], 'धान', 'వరి ధాన్యం', 'நெல்', 'ಭತ್ತ', 'നെല്ല്'),
  c('Rice', ['rice'], 'चावल', 'బియ్యం', 'அரிசி', 'ಅಕ್ಕಿ', 'അരി', { exclude: ['bean'] }),
  c('Wheat', ['wheat'], 'गेहूं', 'గోధుమ', 'கோதுமை', 'ಗೋಧಿ', 'ഗോതമ്പ്'),
  c('Maize', ['maize'], 'मक्का', 'మొక్కజొన్న', 'மக்காச்சோளம்', 'ಮೆಕ್ಕೆಜೋಳ', 'ചോളം'),
  c('Jowar', ['jowar'], 'ज्वार', 'జొన్న', 'சோளம்', 'ಜೋಳ', 'മണിച്ചോളം', { en: 'Jowar (Sorghum)' }),
  c('Bajra', ['bajra'], 'बाजरा', 'సజ్జ', 'கம்பு', 'ಸಜ್ಜೆ', 'കമ്പ്', { en: 'Bajra (Pearl millet)' }),
  c('Ragi', ['ragi'], 'रागी', 'రాగి', 'கேழ்வரகு', 'ರಾಗಿ', 'റാഗി', { en: 'Ragi (Finger millet)' }),
  c('Bengal Gram', ['bengalgram'], 'चना', 'శనగలు', 'கொண்டைக்கடலை', 'ಕಡಲೆ', 'കടല', { en: 'Bengal gram (Chana)' }),
  c('Red Gram', ['arhar', 'redgram', 'tur'], 'अरहर (तूर)', 'కందులు', 'துவரை', 'ತೊಗರಿ', 'തുവര', { en: 'Red gram (Tur)' }),
  c('Green Gram', ['greengram', 'moong'], 'मूंग', 'పెసలు', 'பச்சைப்பயறு', 'ಹೆಸರು', 'ചെറുപയർ', { en: 'Green gram (Moong)' }),
  c('Black Gram', ['blackgram', 'urd'], 'उड़द', 'మినుములు', 'உளுந்து', 'ಉದ್ದು', 'ഉഴുന്ന്', { en: 'Black gram (Urad)' }),
  c('Horse gram', ['kulthi', 'horsegram'], 'कुलथी', 'ఉలవలు', 'கொள்ளு', 'ಹುರುಳಿ', 'മുതിര', { en: 'Horse gram (Kulthi)' }),
  c('Cowpea', ['cowpea'], 'लोबिया', 'అలసందలు', 'காராமணி', 'ಅಲಸಂದೆ', 'വൻപയർ'),
  c('Groundnut', ['groundnut'], 'मूंगफली', 'వేరుశనగ', 'நிலக்கடலை', 'ಕಡಲೆಕಾಯಿ', 'നിലക്കടല'),
  c('Sunflower', ['sunflower'], 'सूरजमुखी', 'పొద్దుతిరుగుడు', 'சூரியகாந்தி', 'ಸೂರ್ಯಕಾಂತಿ', 'സൂര്യകാന്തി'),
  c('Safflower', ['safflower'], 'कुसुम', 'కుసుమ', 'குசும்பா', 'ಕುಸುಬೆ', 'കുസുംഭം'),
  c('Soyabean', ['soyabean', 'soybean'], 'सोयाबीन', 'సోయాబీన్', 'சோயாபீன்', 'ಸೋಯಾಬೀನ್', 'സോയാബീൻ'),
  c('Mustard', ['mustard'], 'सरसों', 'ఆవాలు', 'கடுகு', 'ಸಾಸಿವೆ', 'കടുക്'),
  c('Sesame', ['sesam', 'gingelly', 'til'], 'तिल', 'నువ్వులు', 'எள்', 'ಎಳ್ಳು', 'എള്ള്', { en: 'Sesame (Til)' }),
  c('Castor Seed', ['castor'], 'अरंडी', 'ఆముదాలు', 'ஆமணக்கு', 'ಹರಳು', 'ആവണക്ക്'),
  c('Cotton', ['cotton', 'kapas'], 'कपास', 'పత్తి', 'பருத்தி', 'ಹತ್ತಿ', 'പരുത്തി'),
  c('Cotton seed', ['cottonseed'], 'बिनौला', 'పత్తి గింజలు', 'பருத்தி விதை', 'ಹತ್ತಿ ಬೀಜ', 'പരുത്തിക്കുരു'),
  c('Sugarcane', ['sugarcane'], 'गन्ना', 'చెరకు', 'கரும்பு', 'ಕಬ್ಬು', 'കരിമ്പ്'),
  c('Tobacco', ['tobacco'], 'तंबाकू', 'పొగాకు', 'புகையிலை', 'ತಂಬಾಕು', 'പുകയില'),
  c('Silk cocoon', ['silkcocoon'], 'रेशम कोया', 'పట్టుగూళ్లు', 'பட்டுக்கூடு', 'ರೇಷ್ಮೆ ಗೂಡು', 'പട്ടുനൂൽ കൊക്കൂൺ'),
  c('Mulberry', ['mulberry'], 'शहतूत', 'మల్బరీ', 'மல்பெரி', 'ಹಿಪ್ಪುನೇರಳೆ', 'മൾബറി'),
  c('Jasmine', ['jasmine'], 'मोगरा', 'మల్లెపూలు', 'மல்லிகை', 'ಮಲ್ಲಿಗೆ', 'മുല്ലപ്പൂ'),
  c('Marigold', ['marigold'], 'गेंदा', 'బంతిపూలు', 'செண்டுமல்லி', 'ಚೆಂಡು ಹೂವು', 'ചെണ്ടുമല്ലി'),
]

export const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean)
const SHORT_KEY = 5

// Processed products sell at very different prices from the raw crop (tur dal vs tur, coconut oil vs coconut).
const PROCESSED = ['dal', 'oil', 'cake', 'flour', 'atta', 'powder', 'bran', 'husk', 'rava', 'suji']

/** Length of this crop's longest key matching the (Latin) name, or 0. */
function keyMatch(item: Commodity, nameWords: string[], joined: string): number {
  if (item.exclude?.some((w) => joined.includes(w))) return 0
  let best = 0
  for (const key of item.keys) {
    const ok = key.length < SHORT_KEY ? nameWords[0] === key : joined.startsWith(key)
    if (ok && key.length > best) best = key.length
  }
  return best
}

/** Finds the crop for an Agmarknet commodity name (longest matching key wins, so "Banana - Green" beats "Banana"). */
export function commodityForRecord(name: string): Commodity | undefined {
  const nameWords = words(name)
  const joined = nameWords.join('')
  if (!joined || nameWords.some((w) => PROCESSED.includes(w)) || joined.endsWith('dal')) return undefined
  let best: Commodity | undefined
  let bestLen = 0
  for (const item of COMMODITIES) {
    const len = keyMatch(item, nameWords, joined)
    if (len > bestLen) {
      best = item
      bestLen = len
    }
  }
  return best
}

/** Every crop a free-text name could mean ("chilli" → green chilli and dry chillies). */
export function commodityMatches(query: string): Commodity[] {
  const q = fold(query)
  if (!q) return []
  const exact = COMMODITIES.filter((item) => fold(item.id) === q || Object.values(item.names).some((n) => fold(n) === q))
  if (exact.length) return exact
  const byKey = commodityForRecord(q)
  if (byKey) return [byKey]
  return COMMODITIES.filter((item) => Object.values(item.names).some((n) => fold(n).includes(q)))
}

/**
 * Resolves a crop name in any supported language ("tomato", "టమాటా", "Paddy"). Ambiguous names resolve only
 * when exactly one of the candidates is among `prefer` (the farmer's own crops); otherwise undefined, so the
 * caller can ask which one.
 */
export function findCommodity(query: string, prefer: string[] = []): Commodity | undefined {
  const matches = commodityMatches(query)
  if (matches.length <= 1) return matches[0]
  const preferred = matches.filter((m) => prefer.includes(m.id))
  return preferred.length === 1 ? preferred[0] : undefined
}

const NOT_LETTER = /[^\p{L}\p{M}]/u
const isBoundary = (ch: string | undefined) => ch === undefined || NOT_LETTER.test(ch)

/** Crops named anywhere in a sentence, e.g. "what is the tomato rate today" or "టమాటా ధర ఎంత". */
export function findCommoditiesInText(text: string): Commodity[] {
  const t = fold(text)
  const spans: { item: Commodity; start: number; end: number }[] = []
  for (const item of COMMODITIES) {
    for (const [lang, name] of Object.entries(item.names)) {
      if (lang === 'en') continue
      const n = fold(name)
      for (let at = t.indexOf(n); at >= 0; at = t.indexOf(n, at + 1)) {
        // Indic words take suffixes ("టమాటాల"), so only the start must be a word boundary, except for very
        // short names that are also the start of common words (पान → पानी).
        if (isBoundary(t[at - 1]) && (n.length > 3 || isBoundary(t[at + n.length]))) spans.push({ item, start: at, end: at + n.length })
      }
    }
  }
  // "मूंग" inside "मूंगफली" is groundnut, not moong: drop matches inside a longer one.
  const found = new Set(
    spans
      .filter((s) => !spans.some((o) => o !== s && o.start <= s.start && o.end >= s.end && o.end - o.start > s.end - s.start))
      .map((s) => s.item),
  )
  // English / Romanized: try two-word names first ("bitter gourd", "dry chillies"), then single words.
  const latin = words(t)
  for (let i = 0; i < latin.length; i++) {
    const pair = i + 1 < latin.length ? commodityForRecord(`${latin[i]} ${latin[i + 1]}`) : undefined
    const single = commodityForRecord(latin[i])
    if (pair && pair !== single) {
      found.add(pair)
      i++
    } else if (single) {
      found.add(single)
    }
  }
  return [...found]
}

export function commodityLabel(agmarknetName: string, lang: Lang): string {
  return commodityForRecord(agmarknetName)?.names[lang] ?? agmarknetName
}
