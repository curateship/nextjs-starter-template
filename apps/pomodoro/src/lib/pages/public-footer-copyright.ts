const COPYRIGHT_YEAR_TOKEN = "{year}"
const COPYRIGHT_SITE_TOKEN = "{site}"

/**
 * The copyright line under the public footer.
 *
 * `{year}` and `{site}` in the saved line become the current year and the app
 * name, so a line written once never goes stale. A blank setting falls back to
 * the usual wording rather than leaving the footer's last row empty. A line
 * saved before the tokens existed still has a leading year brought forward,
 * because "© 2021 Acme" typed by hand is the common case and nobody comes back
 * to edit it each January.
 */
export function renderCopyrightText(
  value: string,
  currentYear: number,
  siteName: string
) {
  const template =
    value.trim() ||
    `© ${COPYRIGHT_YEAR_TOKEN} ${COPYRIGHT_SITE_TOKEN}. All rights reserved.`
  const text = template
    .replaceAll(COPYRIGHT_YEAR_TOKEN, String(currentYear))
    .replaceAll(COPYRIGHT_SITE_TOKEN, siteName)

  if (template.includes(COPYRIGHT_YEAR_TOKEN)) {
    return text
  }

  return text.replace(/^(©\s*)\d{4}/, `$1${currentYear}`)
}
