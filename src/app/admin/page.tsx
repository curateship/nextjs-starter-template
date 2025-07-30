import { AdminLayout } from "@/components/admin/layout/admin-layout"

export default function Page() {
  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Products Management</h1>
          <p className="text-muted-foreground mb-8">
            Manage your product catalog, inventory, and categories
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
