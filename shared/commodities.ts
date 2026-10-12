import type { Lang } from './types'

/**
 * Common crops with local names. `keys` are lowercase, letters-only prefixes matched against
 * Agmarknet commodity names (which vary, e.g. "Paddy(Dhan)(Common)", "Cucumbar(Kheera)").
 */
export interface Commodity {
  id: string
  keys: string[]
  names: Record<Lang, string>
}

const c = (id: string, keys: string[], hi: string, te: string, ta: string, kn: string, ml: string, en = id): Commodity => ({
  id,
  keys,
  names: { en, hi, te, ta, kn, ml },
})

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
  c('Bhindi', ['bhindi', 'ladiesfinger'], 'भिंडी', 'బెండకాయ', 'வெண்டைக்காய்', 'ಬೆಂಡೆಕಾಯಿ', 'വെണ്ടയ്ക്ക', 'Bhindi (Okra)'),
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
  c('Ginger', ['ginger'], 'अदरक', 'అల్లం', 'இஞ்சி', 'ಶುಂಠಿ', 'ഇഞ്ചി'),
  c('Tapioca', ['tapioca'], 'टैपिओका', 'కర్రపెండలం', 'மரவள்ளிக்கிழங்கு', 'ಮರಗೆಣಸು', 'കപ്പ'),
  c('Sweet Potato', ['sweetpotato'], 'शकरकंद', 'చిలగడదుంప', 'சர்க்கரைவள்ளிக்கிழங்கு', 'ಸಿಹಿ ಗೆಣಸು', 'മധുരക്കിഴങ്ങ്'),
  c('Banana', ['banana'], 'केला', 'అరటి పండు', 'வாழைப்பழம்', 'ಬಾಳೆಹಣ್ಣು', 'വാഴപ്പഴം'),
  c('Raw Banana', ['bananagreen'], 'कच्चा केला', 'పచ్చి అరటి', 'வாழைக்காய்', 'ಬಾಳೆಕಾಯಿ', 'പച്ചക്കായ'),
  c('Mango', ['mango'], 'आम', 'మామిడి', 'மாம்பழம்', 'ಮಾವು', 'മാങ്ങ'),
  c('Papaya', ['papaya'], 'पपीता', 'బొప్పాయి', 'பப்பாளி', 'ಪಪ್ಪಾಯ', 'പപ്പായ'),
  c('Pomegranate', ['pomegranate'], 'अनार', 'దానిమ్మ', 'மாதுளை', 'ದಾಳಿಂಬೆ', 'മാതളം'),
  c('Grapes', ['grapes'], 'अंगूर', 'ద్రాక్ష', 'திராட்சை', 'ದ್ರಾಕ್ಷಿ', 'മുന്തിരി'),
  c('Lemon', ['lemon', 'lime'], 'नींबू', 'నిమ్మకాయ', 'எலுமிச்சை', 'ನಿಂಬೆಹಣ್ಣು', 'നാരങ്ങ'),
  c('Tamarind', ['tamarind'], 'इमली', 'చింతపండు', 'புளி', 'ಹುಣಸೆಹಣ್ಣು', 'പുളി'),
  c('Coconut', ['coconut'], 'नारियल', 'కొబ్బరి', 'தேங்காய்', 'ತೆಂಗಿನಕಾಯಿ', 'തേങ്ങ'),
  c('Copra', ['copra'], 'खोपरा', 'కొప్పెర', 'கொப்பரை', 'ಕೊಬ್ಬರಿ', 'കൊപ്ര'),
  c('Arecanut', ['arecanut', 'betelnut'], 'सुपारी', 'వక్క', 'பாக்கு', 'ಅಡಿಕೆ', 'അടയ്ക്ക'),
  c('Black pepper', ['blackpepper', 'pepper'], 'काली मिर्च', 'మిరియాలు', 'மிளகு', 'ಕಾಳುಮೆಣಸು', 'കുരുമുളക്'),
  c('Cardamom', ['cardamom'], 'इलायची', 'యాలకులు', 'ஏலக்காய்', 'ಏಲಕ್ಕಿ', 'ഏലം'),
  c('Turmeric', ['turmeric'], 'हल्दी', 'పసుపు', 'மஞ்சள்', 'ಅರಿಶಿನ', 'മഞ്ഞൾ'),
  c('Rubber', ['rubber'], 'रबड़', 'రబ్బరు', 'ரப்பர்', 'ರಬ್ಬರ್', 'റബ്ബർ'),
  c('Paddy', ['paddy'], 'धान', 'వరి ధాన్యం', 'நெல்', 'ಭತ್ತ', 'നെല്ല്'),
  c('Rice', ['rice'], 'चावल', 'బియ్యం', 'அரிசி', 'ಅಕ್ಕಿ', 'അരി'),
  c('Wheat', ['wheat'], 'गेहूं', 'గోధుమ', 'கோதுமை', 'ಗೋಧಿ', 'ഗോതമ്പ്'),
  c('Maize', ['maize'], 'मक्का', 'మొక్కజొన్న', 'மக்காச்சோளம்', 'ಮೆಕ್ಕೆಜೋಳ', 'ചോളം'),
  c('Jowar', ['jowar'], 'ज्वार', 'జొన్న', 'சோளம்', 'ಜೋಳ', 'മണിച്ചോളം', 'Jowar (Sorghum)'),
  c('Bajra', ['bajra'], 'बाजरा', 'సజ్జ', 'கம்பு', 'ಸಜ್ಜೆ', 'കമ്പ്', 'Bajra (Pearl millet)'),
  c('Ragi', ['ragi'], 'रागी', 'రాగి', 'கேழ்வரகு', 'ರಾಗಿ', 'റാഗി', 'Ragi (Finger millet)'),
  c('Bengal Gram', ['bengalgram'], 'चना', 'శనగలు', 'கொண்டைக்கடலை', 'ಕಡಲೆ', 'കടല', 'Bengal gram (Chana)'),
  c('Red Gram', ['arhar', 'redgram', 'tur'], 'अरहर (तूर)', 'కందులు', 'துவரை', 'ತೊಗರಿ', 'തുവര', 'Red gram (Tur)'),
  c('Green Gram', ['greengram', 'moong'], 'मूंग', 'పెసలు', 'பச்சைப்பயறு', 'ಹೆಸರು', 'ചെറുപയർ', 'Green gram (Moong)'),
  c('Black Gram', ['blackgram', 'urd'], 'उड़द', 'మినుములు', 'உளுந்து', 'ಉದ್ದು', 'ഉഴുന്ന്', 'Black gram (Urad)'),
  c('Groundnut', ['groundnut'], 'मूंगफली', 'వేరుశనగ', 'நிலக்கடலை', 'ಕಡಲೆಕಾಯಿ', 'നിലക്കടല'),
  c('Sunflower', ['sunflower'], 'सूरजमुखी', 'పొద్దుతిరుగుడు', 'சூரியகாந்தி', 'ಸೂರ್ಯಕಾಂತಿ', 'സൂര്യകാന്തി'),
  c('Soyabean', ['soyabean', 'soybean'], 'सोयाबीन', 'సోయాబీన్', 'சோயாபீன்', 'ಸೋಯಾಬೀನ್', 'സോയാബീൻ'),
  c('Mustard', ['mustard'], 'सरसों', 'ఆవాలు', 'கடுகு', 'ಸಾಸಿವೆ', 'കടുക്'),
  c('Sesame', ['sesam', 'gingelly', 'til'], 'तिल', 'నువ్వులు', 'எள்', 'ಎಳ್ಳು', 'എള്ള്', 'Sesame (Til)'),
  c('Castor Seed', ['castor'], 'अरंडी', 'ఆముదాలు', 'ஆமணக்கு', 'ಹರಳು', 'ആവണക്ക്'),
  c('Cotton', ['cotton', 'kapas'], 'कपास', 'పత్తి', 'பருத்தி', 'ಹತ್ತಿ', 'പരുത്തി'),
  c('Cotton seed', ['cottonseed'], 'बिनौला', 'పత్తి గింజలు', 'பருத்தி விதை', 'ಹತ್ತಿ ಬೀಜ', 'പരുത്തിക്കുരു'),
  c('Sugarcane', ['sugarcane'], 'गन्ना', 'చెరకు', 'கரும்பு', 'ಕಬ್ಬು', 'കരിമ്പ്'),
]

export const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

// Processed products sell at very different prices from the raw crop (tur dal vs tur, coconut oil vs coconut).
const PROCESSED = ['dal', 'oil', 'cake', 'flour', 'atta', 'powder', 'bran', 'husk', 'rava', 'suji']

/** Finds the crop for an Agmarknet commodity name (longest matching key wins, so "Banana - Green" beats "Banana"). */
export function commodityForRecord(name: string): Commodity | undefined {
  const n = normalizeName(name)
  if (PROCESSED.some((word) => n.includes(word))) return undefined
  let best: Commodity | undefined
  let bestLen = 0
  for (const item of COMMODITIES) {
    for (const key of item.keys) {
      if (n.startsWith(key) && key.length > bestLen) {
        best = item
        bestLen = key.length
      }
    }
  }
  return best
}

/** Resolves free text in any supported language ("tomato", "టమాటా", "Paddy") to a crop. */
export function findCommodity(query: string): Commodity | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  for (const item of COMMODITIES) {
    if (Object.values(item.names).some((n) => n.toLowerCase() === q)) return item
  }
  return commodityForRecord(q) ?? COMMODITIES.find((item) => Object.values(item.names).some((n) => n.toLowerCase().includes(q)))
}

export function commodityLabel(agmarknetName: string, lang: Lang): string {
  return commodityForRecord(agmarknetName)?.names[lang] ?? agmarknetName
}
