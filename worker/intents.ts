import { findCommoditiesInText, type Commodity } from '../shared/commodities'
import { fold } from '../shared/text'

// A few words per language that mark price, weather and scheme questions, so the Worker can look the data up
// before the first AI call instead of paying a second call for the tool round. Misses are fine: the model can
// still call the tool itself. Romanized words cover voice typing in English letters.
const PRICE_WORDS = [
  'price',
  'rate',
  'msp',
  'mandi',
  'market',
  'sell',
  'bhav',
  'bhaav',
  'daam',
  'kimat',
  'keemat',
  'dhara',
  'vilai',
  'bele',
  'dhar',
  'भाव',
  'दाम',
  'कीमत',
  'मंडी',
  'रेट',
  'बेच',
  'बाज़ार',
  'बाजार',
  'ధర',
  'రేటు',
  'రేట్',
  'మార్కెట్',
  'మండి',
  'అమ్మ',
  'விலை',
  'சந்தை',
  'ரேட்',
  'விற்',
  'ಬೆಲೆ',
  'ದರ',
  'ಮಾರುಕಟ್ಟೆ',
  'ಮಂಡಿ',
  'ರೇಟ್',
  'ಮಾರಾಟ',
  'വില',
  'നിരക്ക്',
  'ചന്ത',
  'വിപണി',
  'റേറ്റ്',
]
const WEATHER_WORDS = [
  'rain',
  'weather',
  'spray',
  'forecast',
  'irrigat',
  'wind',
  'storm',
  'temperature',
  'barish',
  'baarish',
  'mausam',
  'varsham',
  'vaana',
  'mazhai',
  'mazha',
  'बारिश',
  'मौसम',
  'छिड़काव',
  'छिडकाव',
  'स्प्रे',
  'सिंचाई',
  'बरसात',
  'आंधी',
  'వర్షం',
  'వాన',
  'వాతావరణం',
  'పిచికారీ',
  'స్ప్రే',
  'నీటి తడి',
  'గాలి',
  'மழை',
  'வானிலை',
  'தெளி',
  'ஸ்ப்ரே',
  'பாசன',
  'ಮಳೆ',
  'ಹವಾಮಾನ',
  'ಸಿಂಪಡ',
  'ಸ್ಪ್ರೇ',
  'ನೀರಾವರಿ',
  'മഴ',
  'കാലാവസ്ഥ',
  'തളി',
  'സ്പ്രേ',
  'ജലസേചന',
]
const SCHEME_WORDS = [
  'scheme',
  'yojana',
  'pm-kisan',
  'pm kisan',
  'pmkisan',
  'kisan credit',
  'insurance',
  'pmfby',
  'bima',
  'subsidy',
  'loan',
  'soil health',
  'enam',
  'e-nam',
  'kusum',
  'solar pump',
  'rythu',
  'raitha',
  'pension',
  'योजना',
  'बीमा',
  'सब्सिडी',
  'ऋण',
  'लोन',
  'किसान सम्मान',
  'अनुदान',
  'పథకం',
  'పథకాలు',
  'బీమా',
  'సబ్సిడీ',
  'రుణం',
  'లోన్',
  'రైతు భరోసా',
  'திட்ட',
  'காப்பீடு',
  'மானியம்',
  'கடன்',
  'ಯೋಜನೆ',
  'ವಿಮೆ',
  'ಸಬ್ಸಿಡಿ',
  'ಸಾಲ',
  'പദ്ധതി',
  'ഇൻഷുറൻസ്',
  'സബ്സിഡി',
  'വായ്പ',
]

// Latin words must start a word ("rate" in "accurate" doesn't count); Indic words are matched anywhere since
// they take suffixes and are long enough not to collide.
function hasWord(text: string, words: string[]) {
  return words.some((w) => {
    if (!/^[a-z -]+$/.test(w)) return text.includes(w)
    return new RegExp(`(?:^|[^a-z])${w.replace(/-/g, '\\-')}`).test(text)
  })
}

export interface Intents {
  /** The one crop a price question is about (none when no crop or several crops are named). */
  priceCrop?: Commodity
  weather: boolean
  schemes: boolean
}

export function detectIntents(question: string): Intents {
  const text = fold(question)
  const crops = hasWord(text, PRICE_WORDS) ? findCommoditiesInText(question) : []
  return {
    priceCrop: crops.length === 1 ? crops[0] : undefined,
    weather: hasWord(text, WEATHER_WORDS),
    schemes: hasWord(text, SCHEME_WORDS),
  }
}
