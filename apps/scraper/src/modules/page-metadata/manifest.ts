import type { ScraperModule } from "@/modules/registry"

export const pageMetadataModule: ScraperModule = {
  key: "page_metadata",
  name: "Page Metadata",
  description: "Fetch public URLs and capture page metadata.",
  href: "/modules/page-metadata",
  icon: "appWindow",
}
