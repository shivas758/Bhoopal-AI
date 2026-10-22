import type { Lang } from '../../shared/types'

/**
 * The language screen's words in every language, so it can show before any dictionary has loaded. Copies of
 * 'settings.language', 'onboard.trust' and 'chat.readAloud' (src/i18n/picker.test.ts keeps them in step).
 */
export const PICKER_TEXT: Record<Lang, { language: string; trust: string; readAloud: string }> = {
  en: { language: 'Language', trust: 'Free for every farmer. No OTP, nothing to pay.', readAloud: 'Read aloud' },
  hi: { language: 'भाषा', trust: 'हर किसान के लिए मुफ़्त। न OTP, न कोई पैसा।', readAloud: 'सुनें' },
  te: { language: 'భాష', trust: 'ప్రతి రైతుకూ ఉచితం. OTP లేదు, ఏమీ చెల్లించనక్కర్లేదు.', readAloud: 'వినండి' },
  ta: { language: 'மொழி', trust: 'எல்லா விவசாயிகளுக்கும் இலவசம். OTP இல்லை, பணம் இல்லை.', readAloud: 'வாசித்துக் காட்டு' },
  kn: { language: 'ಭಾಷೆ', trust: 'ಎಲ್ಲ ರೈತರಿಗೂ ಉಚಿತ. OTP ಇಲ್ಲ, ಹಣ ಕೊಡಬೇಕಿಲ್ಲ.', readAloud: 'ಕೇಳಿಸಿ' },
  ml: { language: 'ഭാഷ', trust: 'എല്ലാ കർഷകർക്കും സൗജന്യം. OTP ഇല്ല, പണം നൽകേണ്ടതില്ല.', readAloud: 'കേൾക്കുക' },
}
