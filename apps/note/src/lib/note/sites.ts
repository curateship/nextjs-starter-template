/** What each source is called out loud. yt-dlp's own name stands for the rest. */
const SITE_NAMES: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  upload: "Your computer",
  web: "the web",
}

/**
 * "YouTube", "Your computer", or yt-dlp's name for any other site, capitalised.
 * A link yt-dlp has not named yet is "the web", which reads right in "The
 * original stays on the web".
 */
export function siteName(source: string) {
  return SITE_NAMES[source] ?? source.charAt(0).toUpperCase() + source.slice(1)
}
