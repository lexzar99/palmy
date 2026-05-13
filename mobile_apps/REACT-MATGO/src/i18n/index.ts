import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en';
import sv from './sv';
import ar from './ar';

export const SUPPORTED_LANGUAGES = ['en', 'sv', 'ar', 'no', 'da', 'fi'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'react-matgo-language';

// Norwegian and Danish are close enough to map to English fallback
// Finnish maps to English fallback too — add full translations later
const LOCALE_MAP: Record<string, SupportedLanguage> = {
  en: 'en', 'en-US': 'en', 'en-GB': 'en', 'en-AU': 'en',
  sv: 'sv', 'sv-SE': 'sv',
  ar: 'ar', 'ar-SA': 'ar', 'ar-EG': 'ar', 'ar-AE': 'ar',
  no: 'en', nb: 'en', nn: 'en',
  da: 'en', 'da-DK': 'en',
  fi: 'en', 'fi-FI': 'en',
};

export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    const code = locale.split('-')[0];
    return LOCALE_MAP[locale] || LOCALE_MAP[code] || 'en';
  } catch {
    return 'en';
  }
}

export async function loadSavedLanguage(): Promise<SupportedLanguage | null> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
      return saved as SupportedLanguage;
    }
  } catch {}
  return null;
}

export async function saveLanguage(lang: SupportedLanguage) {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {}
}

export async function initI18n() {
  const savedLang = await loadSavedLanguage();
  const deviceLang = getDeviceLanguage();
  const lng = savedLang ?? deviceLang;

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        sv: { translation: sv },
        ar: { translation: ar },
      },
      lng,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      // i18next v26 uses v4 plural format by default; our translation files
      // don't use any plural-suffix keys (no `_plural`, `_one`, `_other`),
      // so omitting compatibilityJSON keeps the modern v4 behaviour.
    });

  return i18n;
}

export { i18n };
export default i18n;
