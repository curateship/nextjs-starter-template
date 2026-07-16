import { redirect } from "@/lib/navigation-server"

export default function AdminDashboard() {
  redirect("/admin/sites")
}
