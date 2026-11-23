import { Link } from "@tanstack/react-router"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function BroadcastsTabs({
  active,
}: {
  active: "broadcasts" | "templates"
}) {
  return (
    <Tabs value={active}>
      <TabsList>
        <TabsTrigger value="broadcasts" asChild>
          <Link to="/broadcasts">Broadcasts</Link>
        </TabsTrigger>
        <TabsTrigger value="templates" asChild>
          <Link to="/broadcasts/templates">Templates</Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
