import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * What both plan surfaces show in place of the plan cards when payments are
 * switched off.
 *
 * The cards go with it on purpose. A grid of normal-looking plans whose buttons
 * quietly do nothing reads as broken; this says the same thing once, in the
 * shape every other notice in the app uses.
 */
export function PaymentsOffCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments are off</CardTitle>
        <CardDescription>
          Upgrades are unavailable until billing is switched on.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
