import * as React from "react"

import { loadProtocolsOnce } from "@/lib/api/protocols"
import type {
  ProtocolAbility,
  ProtocolCapabilities,
  ProtocolId,
} from "@/lib/protocols/contracts"

/**
 * What one exchange can do beyond placing an order, as the screens read it.
 *
 * **Asked of the server rather than decided here.** A screen comparing
 * protocol ids is exactly what the protocol fence forbids, and for good
 * reason: the knowledge belongs beside each exchange's own module, where
 * somebody adding an exchange will see it. This carries the same table to the
 * browser as plain data.
 *
 * Undefined while the answer is on its way, which is not the same as "cannot".
 * The screens draw nothing until it lands, so a button that belongs on a row
 * arrives a moment after the row does. That is the right way round: offering a
 * button and then taking it away would be worse than one that turns up late,
 * and the list is one small request made once per page load.
 */
export type ProtocolAbilities = Pick<
  ProtocolCapabilities,
  "changeLeverage" | "adjustMargin"
>

export function useProtocolAbilities(
  protocol: ProtocolId
): ProtocolAbilities | undefined {
  const [table, setTable] = React.useState<ReadonlyMap<
    ProtocolId,
    ProtocolAbilities
  > | null>(null)

  React.useEffect(() => {
    let alive = true
    void loadProtocolsOnce()
      .then((answer) => {
        if (!alive) return
        setTable(
          new Map(
            answer.protocols.map((one) => [
              one.id,
              {
                changeLeverage: one.capabilities.changeLeverage,
                adjustMargin: one.capabilities.adjustMargin,
              },
            ])
          )
        )
      })
      // Silent on purpose: this only decides whether two buttons are offered,
      // and a toast about a build-time list would say nothing anybody can act
      // on. The buttons stay hidden, which is the safe answer.
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return table?.get(protocol)
}

/** True when the ability is known and allowed. */
export function allowed(ability: ProtocolAbility | undefined): boolean {
  return ability?.can === true
}

/** The sentence to show when it is not allowed, or null while unknown. */
export function refusalOf(ability: ProtocolAbility | undefined): string | null {
  return ability !== undefined && !ability.can ? ability.because : null
}
