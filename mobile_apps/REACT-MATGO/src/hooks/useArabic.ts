import { useTranslation } from 'react-i18next';

/**
 * Returns ls() — a letterSpacing helper that returns 0 for Arabic (where any
 * positive letterSpacing breaks character joining) and the given value otherwise.
 */
export function useArabic() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  return {
    isArabic,
    ls: (val: number) => (isArabic && val > 0 ? 0 : val),
  };
}
