export const config = {
  appName: "Scraper",
  apiBaseUrl: (import.meta.env.VITE_SCRAPER_API_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8001",
  adminToken: (import.meta.env.VITE_SCRAPER_ADMIN_TOKEN as string | undefined)?.trim() || undefined,
}
