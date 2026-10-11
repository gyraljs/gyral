export const catalogs = {
  en: { total: 'Total', item: 'item', items: 'items' },
  fr: { total: 'Total', item: 'article', items: 'articles' },
};
export const count = (locale, n) => new Intl.NumberFormat(locale).format(n);
export const plural = (locale, n) => new Intl.PluralRules(locale).select(n);
export const date = (locale, timeZone, value) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(value);
export const relative = (locale, n) => new Intl.RelativeTimeFormat(locale).format(n, 'day');
export const list = (locale, values) => new Intl.ListFormat(locale).format(values);
