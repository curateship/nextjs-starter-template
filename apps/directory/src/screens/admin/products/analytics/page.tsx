import { redirect } from "@/lib/navigation-server"

export default function ProductAnalyticsRedirect() {
  redirect("/admin/products")
}
