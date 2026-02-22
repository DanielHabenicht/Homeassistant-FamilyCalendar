import de from './locales/card.de.json';
import en from './locales/card.en.json';

export type CardTextKey = keyof typeof en;

const dictionaries: Record<'en' | 'de', Record<CardTextKey, string>> = {
  en,
  de,
};

const fallbackLocale: 'en' = 'en';

export function getCardDictionary(locale: string): Record<CardTextKey, string> {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('de')) {
    return dictionaries.de;
  }
  return dictionaries[fallbackLocale];
}

export function getCardText(locale: string, key: CardTextKey): string {
  return getCardDictionary(locale)[key];
}
