import type { Lang } from './types'

// Kept apart from schemes.ts so the app's first screen doesn't download every scheme text in 6 languages.

export interface Helpline {
  phone: string
  label: Record<Lang, string>
}

export const HELPLINES: Helpline[] = [
  {
    phone: '1800-180-1551',
    label: {
      en: 'Kisan Call Centre – farming questions in your language (6 am–10 pm)',
      hi: 'किसान कॉल सेंटर – अपनी भाषा में खेती के सवाल (सुबह 6–रात 10)',
      te: 'కిసాన్ కాల్ సెంటర్ – మీ భాషలో వ్యవసాయ ప్రశ్నలు (ఉదయం 6–రాత్రి 10)',
      ta: 'கிசான் அழைப்பு மையம் – உங்கள் மொழியில் விவசாயக் கேள்விகள் (காலை 6–இரவு 10)',
      kn: 'ಕಿಸಾನ್ ಕಾಲ್ ಸೆಂಟರ್ – ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಕೃಷಿ ಪ್ರಶ್ನೆಗಳು (ಬೆಳಿಗ್ಗೆ 6–ರಾತ್ರಿ 10)',
      ml: 'കിസാൻ കോൾ സെന്റർ – നിങ്ങളുടെ ഭാഷയിൽ കൃഷി സംശയങ്ങൾ (രാവിലെ 6–രാത്രി 10)',
    },
  },
  {
    phone: '155261',
    label: {
      en: 'PM-KISAN helpline',
      hi: 'पीएम-किसान हेल्पलाइन',
      te: 'పీఎం-కిసాన్ హెల్ప్‌లైన్',
      ta: 'பிஎம்-கிசான் உதவி எண்',
      kn: 'ಪಿಎಂ-ಕಿಸಾನ್ ಸಹಾಯವಾಣಿ',
      ml: 'പിഎം-കിസാൻ ഹെൽപ്‌ലൈൻ',
    },
  },
  {
    phone: '14447',
    label: {
      en: 'Crop insurance (PMFBY) – report crop loss',
      hi: 'फसल बीमा (PMFBY) – फसल नुकसान की सूचना',
      te: 'పంట బీమా (PMFBY) – పంట నష్టం తెలియజేయండి',
      ta: 'பயிர்க் காப்பீடு (PMFBY) – பயிர் இழப்பைத் தெரிவிக்க',
      kn: 'ಬೆಳೆ ವಿಮೆ (PMFBY) – ಬೆಳೆ ನಷ್ಟ ತಿಳಿಸಲು',
      ml: 'വിള ഇൻഷുറൻസ് (PMFBY) – വിളനാശം അറിയിക്കാൻ',
    },
  },
  {
    phone: '1800-270-0224',
    label: {
      en: 'e-NAM online mandi',
      hi: 'ई-नाम ऑनलाइन मंडी',
      te: 'ఈ-నామ్ ఆన్‌లైన్ మార్కెట్',
      ta: 'இ-நாம் ஆன்லைன் சந்தை',
      kn: 'ಇ-ನಾಮ್ ಆನ್‌ಲೈನ್ ಮಾರುಕಟ್ಟೆ',
      ml: 'ഇ-നാം ഓൺലൈൻ വിപണി',
    },
  },
  {
    phone: '108',
    label: {
      en: 'Ambulance / emergency (also for pesticide poisoning)',
      hi: 'एम्बुलेंस / आपातकाल (कीटनाशक ज़हर के लिए भी)',
      te: 'అంబులెన్స్ / అత్యవసరం (పురుగుమందు విషప్రయోగానికి కూడా)',
      ta: 'ஆம்புலன்ஸ் / அவசரம் (பூச்சிமருந்து நச்சுக்கும்)',
      kn: 'ಆಂಬ್ಯುಲೆನ್ಸ್ / ತುರ್ತು (ಕೀಟನಾಶಕ ವಿಷಕ್ಕೂ)',
      ml: 'ആംബുലൻസ് / അടിയന്തരം (കീടനാശിനി വിഷബാധയ്ക്കും)',
    },
  },
  {
    phone: '112',
    label: {
      en: 'All-India emergency number (police, fire, ambulance)',
      hi: 'अखिल भारतीय आपातकालीन नंबर (पुलिस, आग, एम्बुलेंस)',
      te: 'దేశవ్యాప్త అత్యవసర నంబర్ (పోలీసు, అగ్నిమాపక, అంబులెన్స్)',
      ta: 'அகில இந்திய அவசர எண் (காவல், தீயணைப்பு, ஆம்புலன்ஸ்)',
      kn: 'ಅಖಿಲ ಭಾರತ ತುರ್ತು ಸಂಖ್ಯೆ (ಪೊಲೀಸ್, ಅಗ್ನಿಶಾಮಕ, ಆಂಬ್ಯುಲೆನ್ಸ್)',
      ml: 'അഖിലേന്ത്യ അടിയന്തര നമ്പർ (പോലീസ്, ഫയർ, ആംബുലൻസ്)',
    },
  },
]

/** Kisan Call Centre: the one number every "ask an expert" message points to. */
export const KCC_PHONE = HELPLINES[0].phone

/** Free 24×7 Tele-MANAS mental-health helpline, for a farmer who sounds hopeless. */
export const TELE_MANAS_PHONE = '14416'

/** Numbers the AI may say besides HELPLINES and scheme phones (child helpline, cyber-fraud helpline, Tele-MANAS). */
export const EXTRA_ALLOWED_PHONES = ['1098', '1930', TELE_MANAS_PHONE, '1-800-891-4416']
