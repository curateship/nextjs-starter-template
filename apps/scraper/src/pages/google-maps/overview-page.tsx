import { DashboardContent } from "@/components/dashboard-content"
import { DataTable4 } from "@/components/data-table4"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const overviewCards = [
  ["Revenue", "Monthly gross volume", "$48,240"],
  ["Orders", "Processed this week", "1,284"],
  ["Conversion", "Checkout completion rate", "4.82%"],
  ["Refunds", "Open review queue", "18"],
] as const

export function OverviewPage() {
  return (
    <DashboardContent>
      <section className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map(([title, description, value]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <DataTable4 />
    </DashboardContent>
  )
}
