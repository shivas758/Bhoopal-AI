import type { Lang } from './types'

// Sentences the Worker writes itself, without the AI: the instant price answer and the safety notes it adds
// to AI answers. Same friendly voice as the chat persona. Needs native-speaker review like src/i18n.

interface Phrases {
  priceHeading: string
  priceHeadingDistrict: string
  priceStateFallback: string
  quintal: string
  kg: string
  priceTypical: string
  priceMsp: string
  priceBelowMsp: string
  priceStale: string
  priceClose: string
  bannedWarning: string
  phoneRemoved: string
}

export const PHRASES: Record<Lang, Phrases> = {
  en: {
    priceHeading: 'Here are the latest {crop} prices near you 🌾',
    priceHeadingDistrict: 'Here are the latest {crop} prices in {district} mandis 🌾',
    priceStateFallback: 'No mandi in {district} reported {crop} in the last few days, so here are prices from across {state} 🌾',
    quintal: 'quintal',
    kg: 'kg',
    priceTypical: 'Most mandis: around ₹{typical}/quintal (₹{low}–₹{high}).',
    priceMsp: 'MSP ({season}): ₹{msp}/quintal.',
    priceBelowMsp: 'Mandi prices are below MSP, so ask about selling at a government procurement centre.',
    priceStale: 'Note: the newest report is from {date}.',
    priceClose: 'Prices change every day: compare 2–3 mandis or check eNAM before you sell. Want tips on the best time to sell? Just ask! 👍',
    bannedWarning: "⚠️ Safety note: {name} is banned or restricted in India. Please don't buy or use it; ask your agriculture officer or KVK for a safe, approved option.",
    phoneRemoved: '(number not verified – call Kisan Call Centre {kcc})',
  },
  hi: {
    priceHeading: 'आपके पास की मंडियों में {crop} के ताज़ा भाव ये रहे 🌾',
    priceHeadingDistrict: '{district} की मंडियों में {crop} के ताज़ा भाव ये रहे 🌾',
    priceStateFallback: 'पिछले कुछ दिनों में {district} की किसी मंडी से {crop} का भाव नहीं आया, इसलिए पूरे {state} के भाव देखिए 🌾',
    quintal: 'क्विंटल',
    kg: 'किलो',
    priceTypical: 'ज़्यादातर मंडियों में: लगभग ₹{typical}/क्विंटल (₹{low}–₹{high})।',
    priceMsp: 'MSP ({season}): ₹{msp}/क्विंटल।',
    priceBelowMsp: 'मंडी भाव MSP से कम हैं, इसलिए सरकारी खरीद केंद्र पर बेचने के बारे में पूछिए।',
    priceStale: 'ध्यान दें: सबसे नया भाव {date} का है।',
    priceClose: 'भाव रोज़ बदलते हैं: बेचने से पहले 2–3 मंडियों या eNAM पर भाव ज़रूर मिलाइए। कब बेचना अच्छा रहेगा, यह जानना है? बस पूछिए! 👍',
    bannedWarning: '⚠️ सुरक्षा सूचना: {name} भारत में प्रतिबंधित या सीमित है। कृपया इसे न खरीदें, न इस्तेमाल करें; सुरक्षित और मान्य दवा के लिए कृषि अधिकारी या KVK से पूछें।',
    phoneRemoved: '(नंबर सत्यापित नहीं – किसान कॉल सेंटर {kcc} पर कॉल करें)',
  },
  te: {
    priceHeading: 'మీ దగ్గరలోని మార్కెట్లలో {crop} తాజా ధరలు ఇవిగో 🌾',
    priceHeadingDistrict: '{district} మార్కెట్లలో {crop} తాజా ధరలు ఇవిగో 🌾',
    priceStateFallback: 'గత కొన్ని రోజుల్లో {district}లోని ఏ మార్కెట్ నుండీ {crop} ధర రాలేదు, అందుకే {state} అంతటా ధరలు చూడండి 🌾',
    quintal: 'క్వింటాల్',
    kg: 'కిలో',
    priceTypical: 'చాలా మార్కెట్లలో: సుమారు ₹{typical}/క్వింటాల్ (₹{low}–₹{high}).',
    priceMsp: 'MSP ({season}): ₹{msp}/క్వింటాల్.',
    priceBelowMsp: 'మార్కెట్ ధరలు MSP కంటే తక్కువగా ఉన్నాయి, కాబట్టి ప్రభుత్వ కొనుగోలు కేంద్రంలో అమ్మడం గురించి అడగండి.',
    priceStale: 'గమనిక: తాజా ధర {date} నాటిది.',
    priceClose: 'ధరలు రోజూ మారుతాయి: అమ్మే ముందు 2–3 మార్కెట్లు లేదా eNAM లో ధరలు పోల్చి చూడండి. ఎప్పుడు అమ్మితే మంచిదో తెలుసుకోవాలా? అడగండి! 👍',
    bannedWarning: '⚠️ భద్రతా సూచన: {name} భారతదేశంలో నిషేధించబడింది లేదా పరిమితం చేయబడింది. దయచేసి దీన్ని కొనవద్దు, వాడవద్దు; సురక్షితమైన, అనుమతి ఉన్న మందు కోసం వ్యవసాయ అధికారి లేదా KVK ని అడగండి.',
    phoneRemoved: '(నంబర్ నిర్ధారించబడలేదు – కిసాన్ కాల్ సెంటర్ {kcc}కు కాల్ చేయండి)',
  },
  ta: {
    priceHeading: 'உங்கள் அருகிலுள்ள சந்தைகளில் {crop} சமீபத்திய விலைகள் இதோ 🌾',
    priceHeadingDistrict: '{district} சந்தைகளில் {crop} சமீபத்திய விலைகள் இதோ 🌾',
    priceStateFallback: 'கடந்த சில நாட்களில் {district} மாவட்டத்தின் எந்தச் சந்தையிலிருந்தும் {crop} விலை வரவில்லை, அதனால் {state} முழுவதுமான விலைகள் இதோ 🌾',
    quintal: 'குவிண்டால்',
    kg: 'கிலோ',
    priceTypical: 'பெரும்பாலான சந்தைகளில்: சுமார் ₹{typical}/குவிண்டால் (₹{low}–₹{high}).',
    priceMsp: 'MSP ({season}): ₹{msp}/குவிண்டால்.',
    priceBelowMsp: 'சந்தை விலை MSP-ஐ விடக் குறைவு, அதனால் அரசு கொள்முதல் நிலையத்தில் விற்பது பற்றிக் கேளுங்கள்.',
    priceStale: 'குறிப்பு: சமீபத்திய விலை {date} அன்று வந்தது.',
    priceClose: 'விலைகள் தினமும் மாறும்: விற்கும் முன் 2–3 சந்தைகள் அல்லது eNAM-இல் விலையை ஒப்பிடுங்கள். எப்போது விற்பது நல்லது என்று தெரிய வேண்டுமா? கேளுங்கள்! 👍',
    bannedWarning: '⚠️ பாதுகாப்புக் குறிப்பு: {name} இந்தியாவில் தடைசெய்யப்பட்டது அல்லது கட்டுப்படுத்தப்பட்டது. தயவுசெய்து இதை வாங்கவோ பயன்படுத்தவோ வேண்டாம்; பாதுகாப்பான, அனுமதிக்கப்பட்ட மருந்துக்கு வேளாண் அலுவலர் அல்லது KVK-யிடம் கேளுங்கள்.',
    phoneRemoved: '(எண் சரிபார்க்கப்படவில்லை – கிசான் அழைப்பு மையம் {kcc}-ஐ அழையுங்கள்)',
  },
  kn: {
    priceHeading: 'ನಿಮ್ಮ ಹತ್ತಿರದ ಮಾರುಕಟ್ಟೆಗಳಲ್ಲಿ {crop} ಇತ್ತೀಚಿನ ಬೆಲೆಗಳು ಇಲ್ಲಿವೆ 🌾',
    priceHeadingDistrict: '{district} ಮಾರುಕಟ್ಟೆಗಳಲ್ಲಿ {crop} ಇತ್ತೀಚಿನ ಬೆಲೆಗಳು ಇಲ್ಲಿವೆ 🌾',
    priceStateFallback: 'ಕಳೆದ ಕೆಲವು ದಿನಗಳಲ್ಲಿ {district} ಜಿಲ್ಲೆಯ ಯಾವ ಮಾರುಕಟ್ಟೆಯಿಂದಲೂ {crop} ಬೆಲೆ ಬಂದಿಲ್ಲ, ಆದ್ದರಿಂದ {state} ರಾಜ್ಯದಾದ್ಯಂತದ ಬೆಲೆಗಳು ಇಲ್ಲಿವೆ 🌾',
    quintal: 'ಕ್ವಿಂಟಾಲ್',
    kg: 'ಕೆಜಿ',
    priceTypical: 'ಹೆಚ್ಚಿನ ಮಾರುಕಟ್ಟೆಗಳಲ್ಲಿ: ಸುಮಾರು ₹{typical}/ಕ್ವಿಂಟಾಲ್ (₹{low}–₹{high}).',
    priceMsp: 'MSP ({season}): ₹{msp}/ಕ್ವಿಂಟಾಲ್.',
    priceBelowMsp: 'ಮಾರುಕಟ್ಟೆ ಬೆಲೆ MSP ಗಿಂತ ಕಡಿಮೆ ಇದೆ, ಆದ್ದರಿಂದ ಸರ್ಕಾರಿ ಖರೀದಿ ಕೇಂದ್ರದಲ್ಲಿ ಮಾರಾಟದ ಬಗ್ಗೆ ವಿಚಾರಿಸಿ.',
    priceStale: 'ಗಮನಿಸಿ: ಇತ್ತೀಚಿನ ಬೆಲೆ {date} ರದ್ದು.',
    priceClose: 'ಬೆಲೆಗಳು ಪ್ರತಿದಿನ ಬದಲಾಗುತ್ತವೆ: ಮಾರುವ ಮೊದಲು 2–3 ಮಾರುಕಟ್ಟೆಗಳು ಅಥವಾ eNAM ನಲ್ಲಿ ಬೆಲೆ ಹೋಲಿಸಿ ನೋಡಿ. ಯಾವಾಗ ಮಾರಿದರೆ ಒಳ್ಳೆಯದು ಅಂತ ತಿಳಿಯಬೇಕೇ? ಕೇಳಿ! 👍',
    bannedWarning: '⚠️ ಸುರಕ್ಷತಾ ಸೂಚನೆ: {name} ಭಾರತದಲ್ಲಿ ನಿಷೇಧಿತ ಅಥವಾ ನಿರ್ಬಂಧಿತ. ದಯವಿಟ್ಟು ಇದನ್ನು ಖರೀದಿಸಬೇಡಿ, ಬಳಸಬೇಡಿ; ಸುರಕ್ಷಿತ, ಅನುಮೋದಿತ ಔಷಧಿಗಾಗಿ ಕೃಷಿ ಅಧಿಕಾರಿ ಅಥವಾ KVK ಯನ್ನು ಕೇಳಿ.',
    phoneRemoved: '(ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿಲ್ಲ – ಕಿಸಾನ್ ಕಾಲ್ ಸೆಂಟರ್ {kcc} ಗೆ ಕರೆ ಮಾಡಿ)',
  },
  ml: {
    priceHeading: 'നിങ്ങളുടെ അടുത്തുള്ള ചന്തകളിലെ {crop} പുതിയ വിലകൾ ഇതാ 🌾',
    priceHeadingDistrict: '{district} ചന്തകളിലെ {crop} പുതിയ വിലകൾ ഇതാ 🌾',
    priceStateFallback: 'കഴിഞ്ഞ കുറച്ചു ദിവസങ്ങളിൽ {district} ജില്ലയിലെ ഒരു ചന്തയിൽ നിന്നും {crop} വില വന്നിട്ടില്ല, അതിനാൽ {state} മുഴുവനുമുള്ള വിലകൾ ഇതാ 🌾',
    quintal: 'ക്വിന്റൽ',
    kg: 'കിലോ',
    priceTypical: 'മിക്ക ചന്തകളിലും: ഏകദേശം ₹{typical}/ക്വിന്റൽ (₹{low}–₹{high}).',
    priceMsp: 'MSP ({season}): ₹{msp}/ക്വിന്റൽ.',
    priceBelowMsp: 'ചന്ത വില MSP-യേക്കാൾ കുറവാണ്, അതിനാൽ സർക്കാർ സംഭരണ കേന്ദ്രത്തിൽ വിൽക്കുന്നതിനെക്കുറിച്ച് ചോദിക്കൂ.',
    priceStale: 'ശ്രദ്ധിക്കുക: ഏറ്റവും പുതിയ വില {date}-ലേതാണ്.',
    priceClose: 'വിലകൾ ദിവസവും മാറും: വിൽക്കുന്നതിന് മുമ്പ് 2–3 ചന്തകളിലോ eNAM-ലോ വില താരതമ്യം ചെയ്യൂ. എപ്പോൾ വിൽക്കുന്നതാണ് നല്ലതെന്ന് അറിയണോ? ചോദിച്ചോളൂ! 👍',
    bannedWarning: '⚠️ സുരക്ഷാ കുറിപ്പ്: {name} ഇന്ത്യയിൽ നിരോധിച്ചതോ നിയന്ത്രിച്ചതോ ആണ്. ദയവായി ഇത് വാങ്ങുകയോ ഉപയോഗിക്കുകയോ ചെയ്യരുത്; സുരക്ഷിതവും അംഗീകൃതവുമായ മരുന്നിനായി കൃഷി ഓഫീസറോടോ KVK-യോടോ ചോദിക്കൂ.',
    phoneRemoved: '(നമ്പർ പരിശോധിച്ചിട്ടില്ല – കിസാൻ കോൾ സെന്റർ {kcc}-ൽ വിളിക്കൂ)',
  },
}

/** Fills {name} placeholders. */
export const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
