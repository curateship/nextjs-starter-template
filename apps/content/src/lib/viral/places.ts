/**
 * Country and Language in a project's ⋮ (Tyler, 6 Nov 2026: "Every country +
 * language", with Anywhere as the default). Fixed lists of codes, so picking
 * one costs no YouTube units. Client-safe.
 *
 * The country goes to YouTube's search as `regionCode`, an ISO 3166-1 code.
 * YouTube's own docs say a country it doesn't support is answered as another
 * country it picks, never refused, so every country is offered.
 *
 * The language goes as `relevanceLanguage`, an ISO 639-1 code, except that
 * YouTube wants `zh-Hans` and `zh-Hant` for Chinese, so those two stand in
 * for `zh`. A language only ranks results; it never hides any.
 *
 * Names come from the browser's own `Intl.DisplayNames`, in English, so the
 * lists hold codes alone.
 */

/** Every ISO 3166-1 alpha-2 country code. */
export const VIRAL_COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const

export type ViralCountryCode = (typeof VIRAL_COUNTRY_CODES)[number]

/** Every ISO 639-1 language code, with Chinese as YouTube spells it. */
export const VIRAL_LANGUAGE_CODES = [
  "aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az", "ba", "be", "bg", "bi",
  "bm", "bn", "bo", "br", "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu", "cv", "cy", "da", "de",
  "dv", "dz", "ee", "el", "en", "eo", "es", "et", "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy",
  "ga", "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr", "ht", "hu", "hy", "hz", "ia",
  "id", "ie", "ig", "ii", "ik", "io", "is", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk",
  "kl", "km", "kn", "ko", "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo",
  "lt", "lu", "lv", "mg", "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "na", "nb", "nd",
  "ne", "ng", "nl", "nn", "no", "nr", "nv", "ny", "oc", "oj", "om", "or", "os", "pa", "pi", "pl",
  "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se", "sg", "si", "sk", "sl",
  "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk",
  "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty", "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa",
  "wo", "xh", "yi", "yo", "za", "zh-Hans", "zh-Hant", "zu",
] as const

export type ViralLanguageCode = (typeof VIRAL_LANGUAGE_CODES)[number]

/** What the ⋮ row says when nothing is picked. */
export const ANYWHERE = "Anywhere"

export type PlaceOption = { value: string; label: string }

function namer(type: "region" | "language") {
  try {
    return new Intl.DisplayNames(["en"], { type, fallback: "code" })
  } catch {
    return null
  }
}

const countryNames = namer("region")
const languageNames = namer("language")

/** "United Kingdom" for GB, the code itself if the browser has no name for it. */
export function countryName(code: string): string {
  return countryNames?.of(code) ?? code
}

/** "English" for en, "Simplified Chinese" for zh-Hans. */
export function languageName(code: string): string {
  return languageNames?.of(code) ?? code
}

function sortedByLabel(codes: readonly string[], name: (code: string) => string): PlaceOption[] {
  return codes.map((code) => ({ value: code, label: name(code) })).sort((left, right) => left.label.localeCompare(right.label))
}

/** Every country, A to Z by name. */
export function countryOptions(): PlaceOption[] {
  return sortedByLabel(VIRAL_COUNTRY_CODES, countryName)
}

/** Every language, A to Z by name. */
export function languageOptions(): PlaceOption[] {
  return sortedByLabel(VIRAL_LANGUAGE_CODES, languageName)
}
