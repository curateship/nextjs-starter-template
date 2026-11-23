import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { matchesClient, NO_CLIENT_FILTER } from "@/lib/project/clients"
import { cn } from "@/lib/utils"

const ANY = "any"

/**
 * The Client choice (Features 16 Oct, part 9): any client, one of the
 * clients given, or "No client". A client picked in a pasted link or a saved
 * view that nothing shown has any more still shows, so the choice never
 * reads blank.
 */
export function ClientFilterSelect({
  id,
  value,
  clients,
  onChange,
  className,
}: {
  id: string
  value: string | undefined
  clients: readonly string[]
  onChange: (client: string | undefined) => void
  className?: string
}) {
  const known = value && value !== NO_CLIENT_FILTER ? clients.find((client) => matchesClient(client, value)) : undefined
  const rows = value && value !== NO_CLIENT_FILTER && !known ? [...clients, value] : clients
  return (
    <Select
      value={value ? (known ?? value) : ANY}
      onValueChange={(next) => onChange(next === ANY ? undefined : next)}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any client</SelectItem>
        {rows.map((client) => (
          <SelectItem key={client} value={client}>
            {client}
          </SelectItem>
        ))}
        <SelectItem value={NO_CLIENT_FILTER}>No client</SelectItem>
      </SelectContent>
    </Select>
  )
}
