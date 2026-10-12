// Where a farmer confirms a STATE scheme. Amounts and rules change every season, so the AI names the scheme
// and the office only, never amounts. Portal links are added only after they have been checked (last: 2026-10).
import type { Lang } from './types'

export interface StateAgriInfo {
  /** The village/block office farmers actually visit. */
  office: string
  /** Current state scheme names the AI may mention (no amounts). */
  schemes: string[]
  /** The state agriculture department's official site, shown on the Schemes page and given to the AI. */
  portal?: { url: string; name: Record<Lang, string> }
}

export const STATE_AGRI_INFO: Record<string, StateAgriInfo> = {
  'Andhra Pradesh': {
    office: 'the Rythu Seva Kendram (RSK) in your village or the Mandal Agriculture Officer',
    schemes: ['Annadata Sukhibhava – PM Kisan (state income support paid with PM-KISAN)'],
    portal: {
      url: 'https://annadathasukhibhava.ap.gov.in/',
      name: {
        en: 'Annadata Sukhibhava – PM Kisan (status)',
        hi: 'अन्नदाता सुखीभव – पीएम किसान (स्थिति)',
        te: 'అన్నదాత సుఖీభవ – పీఎం కిసాన్ (స్థితి)',
        ta: 'அன்னதாதா சுகிபவ – பிஎம் கிசான் (நிலை)',
        kn: 'ಅನ್ನದಾತ ಸುಖೀಭವ – ಪಿಎಂ ಕಿಸಾನ್ (ಸ್ಥಿತಿ)',
        ml: 'അന്നദാത സുഖീഭവ – പിഎം കിസാൻ (നില)',
      },
    },
  },
  Telangana: {
    office: 'the Agriculture Extension Officer (AEO) at the Rythu Vedika, or the Mandal Agriculture Officer',
    schemes: ['Rythu Bharosa (investment support per acre each season)', 'Rythu Bima (life insurance for farmers)'],
    portal: {
      url: 'https://agri.telangana.gov.in/',
      name: {
        en: 'Telangana Agriculture Department',
        hi: 'तेलंगाना कृषि विभाग',
        te: 'తెలంగాణ వ్యవసాయ శాఖ',
        ta: 'தெலங்கானா வேளாண் துறை',
        kn: 'ತೆಲಂಗಾಣ ಕೃಷಿ ಇಲಾಖೆ',
        ml: 'തെലങ്കാന കൃഷി വകുപ്പ്',
      },
    },
  },
  Karnataka: {
    office: 'the Raitha Samparka Kendra (RSK) in your hobli',
    schemes: ['Krishi Bhagya (farm ponds)', 'Raitha Siri (support for millet growers)', 'FRUITS farmer ID registration (needed for most benefits)'],
    portal: {
      url: 'https://raitamitra.karnataka.gov.in/',
      name: {
        en: 'Karnataka Agriculture Department (Raitha Mitra)',
        hi: 'कर्नाटक कृषि विभाग (रैता मित्र)',
        te: 'కర్ణాటక వ్యవసాయ శాఖ (రైత మిత్ర)',
        ta: 'கர்நாடக வேளாண் துறை (ரைத மித்ர)',
        kn: 'ಕರ್ನಾಟಕ ಕೃಷಿ ಇಲಾಖೆ (ರೈತ ಮಿತ್ರ)',
        ml: 'കർണാടക കൃഷി വകുപ്പ് (റൈത മിത്ര)',
      },
    },
  },
  'Tamil Nadu': {
    office: 'the block Agricultural Extension Centre or the Assistant Director of Agriculture; scheme news is also in the Uzhavan app',
    schemes: [],
    portal: {
      url: 'https://www.tnagrisnet.tn.gov.in/',
      name: {
        en: 'Tamil Nadu Agriculture Department',
        hi: 'तमिलनाडु कृषि विभाग',
        te: 'తమిళనాడు వ్యవసాయ శాఖ',
        ta: 'தமிழ்நாடு வேளாண் துறை',
        kn: 'ತಮಿಳುನಾಡು ಕೃಷಿ ಇಲಾಖೆ',
        ml: 'തമിഴ്നാട് കൃഷി വകുപ്പ്',
      },
    },
  },
  Kerala: {
    office: 'the Krishi Bhavan in your panchayat; most benefits need registration on the AIMS portal there',
    schemes: [],
    portal: {
      url: 'https://aims.kerala.gov.in/',
      name: {
        en: 'AIMS – Kerala farmer registration and schemes',
        hi: 'AIMS – केरल किसान पंजीकरण और योजनाएँ',
        te: 'AIMS – కేరళ రైతు నమోదు, పథకాలు',
        ta: 'AIMS – கேரள விவசாயி பதிவு மற்றும் திட்டங்கள்',
        kn: 'AIMS – ಕೇರಳ ರೈತ ನೋಂದಣಿ ಮತ್ತು ಯೋಜನೆಗಳು',
        ml: 'AIMS – കേരള കർഷക രജിസ്ട്രേഷനും പദ്ധതികളും',
      },
    },
  },
  Puducherry: {
    office: 'the Agricultural Extension Centre or the Department of Agriculture office near you',
    schemes: [],
  },
}

export const DEFAULT_AGRI_OFFICE = 'the block or district agriculture office, or the Krishi Vigyan Kendra (KVK)'
