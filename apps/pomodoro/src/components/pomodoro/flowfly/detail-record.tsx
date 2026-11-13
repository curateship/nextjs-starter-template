import * as React from "react"
import { InfoIcon } from "lucide-react"

import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { DetailRow } from "@/components/pomodoro/admin-member-record"
import { PanelCard } from "@/components/shared/panel-card"

/**
 * A row's record on the Flowfly dashboard's right panel, for a list whose
 * rows had no window of their own before (Tyler, 13 Nov 2026: every row
 * opens on the right). The shell's `RecordFrame`: the row's icon, name and
 * one muted line, then a Details card of its facts, then whatever else the
 * list knows about it, and a footer with its state and main button.
 */
export function DetailRecord({
  icon,
  title,
  line,
  facts,
  hideLabel,
  actions,
  children,
  state,
  footer,
}: {
  icon: React.ReactNode
  title: string
  line?: string | null
  /** Name and value pairs, the row's columns and more. */
  facts: [string, React.ReactNode][]
  /** "Hide the tag". */
  hideLabel: string
  /** The record's own header buttons, its ⋮ last. */
  actions?: React.ReactNode
  /** More cards under Details. */
  children?: React.ReactNode
  /** The footer's words: where the row stands. */
  state?: React.ReactNode
  /** The footer's buttons. */
  footer?: React.ReactNode
}) {
  return (
    <RecordFrame
      avatar={icon}
      title={title}
      line={line}
      hideLabel={hideLabel}
      actions={actions}
      body={
        <>
          <PanelCard storageId="pomodoro-flowfly-details" icon={<InfoIcon />} title="Details">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {facts.map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} />
              ))}
            </div>
          </PanelCard>
          {children}
        </>
      }
      footer={
        state || footer ? (
          <>
            <FooterState>
              <span className="truncate text-muted-foreground">{state}</span>
            </FooterState>
            {footer}
          </>
        ) : undefined
      }
    />
  )
}

/** The right panel while a list has no rows: what will show there, and why it is empty. */
export function NoRecord({ title, icon, line }: { title: string; icon: React.ReactNode; line: string }) {
  return <EmptyRecord title={title} icon={icon} line={line} hideLabel={`Hide the ${title.toLowerCase()}`} />
}
