"use client"

import { TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  visitors: {
    label: "Visitors",
    color: "var(--chart-1)",
  },
  views: {
    label: "Page Views",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

interface ChartBarVisitorsProps {
  data: { date: string; views: number; visitors: number }[]
  totalVisitors: number
}

export function ChartBarVisitors({ data, totalVisitors }: ChartBarVisitorsProps) {
  const last7 = data.slice(-7)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unique Visitors</CardTitle>
        <CardDescription>Daily visitors - last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart accessibilityLayer data={last7}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <ChartLegend content={<ChartLegendContent payload={[]} />} />
            <Bar
              dataKey="visitors"
              stackId="a"
              fill="var(--color-visitors)"
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="views"
              stackId="a"
              fill="var(--color-views)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {totalVisitors.toLocaleString()} total unique visitors <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Showing daily visitors for the last 7 days
        </div>
      </CardFooter>
    </Card>
  )
}
