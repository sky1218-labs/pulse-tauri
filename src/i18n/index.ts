import { translations, type LocaleCode } from "./translations";

export type { LocaleCode };

/** Original stores locale as `zh_TW`; the rewrite uses BCP-47 codes. */
export function normalizeLocale(raw: string | undefined): LocaleCode {
  if (!raw) return "zh-TW";
  const v = raw.replace("_", "-");
  if (v === "zh-TW" || v === "zh-tw") return "zh-TW";
  if (v === "zh-CN" || v === "zh-cn" || v === "zh") return "zh-CN";
  if (v.startsWith("en")) return "en";
  return "zh-TW";
}

export function translate(locale: LocaleCode, key: string, params?: Record<string, string | number>): string {
  let s = translations[locale][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
