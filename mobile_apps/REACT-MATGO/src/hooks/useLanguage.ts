import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SupportedLanguage, saveLanguage } from '../i18n';
import i18n from '../i18n';
import { useRestartApp } from '../contexts/restart';

export function useLanguage() {
  const { i18n: i18nInstance } = useTranslation();
  const restartApp = useRestartApp();
  const current = i18nInstance.language as SupportedLanguage;

  const changeLanguage = useCallback(async (lang: SupportedLanguage) => {
    await saveLanguage(lang);
    await i18n.changeLanguage(lang);
    restartApp();
  }, [restartApp]);

  return { currentLanguage: current, changeLanguage };
}
