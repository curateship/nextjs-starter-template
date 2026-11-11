import * as React from "react"
import { UserIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { AddToContactsRow, LeadFactGroups } from "@/components/crm/crm-record-menu"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import {
  addLeadToContactList,
  getLeadErrorMessage,
  loadLead,
  saveLead,
  type LeadBundle,
} from "@/lib/api/crm/leads"
import { CRM_STAGE_LABELS } from "@/lib/crm/crm"
import { initialsFor } from "@/lib/crm/inbox-time"
import { formatDate } from "@/lib/format/format-time"
import { formatMoney } from "@/lib/format/money"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A lead opened on the People tab, in the frame every record on the right
 * uses (`RecordFrame`):
 *
 * - **⋮, General:** the same Person, Deal and Follow up rows the
 *   conversation's ⋮ has (`LeadFactGroups`), so a lead's facts are changed
 *   the same way wherever it is open, then Add to subscribers.
 * - **Body:** that nobody has written yet. A lead with a conversation never
 *   opens here: People shows the conversation itself in its place
 *   (`ConversationRecord`; Tyler, 9 Nov 2026: "If there's a conversation,
 *   why not just put the conversation there instead of a button?").
 * - **Footer:** where the deal stands, and Add to subscribers, or Open their
 *   contact for a lead already on the list. A lead never gets a newsletter
 *   until somebody adds them (Tyler, 7 Nov 2026).
 */
export function LeadRecord({
  leadId,
  onOpenContact,
  onChanged,
}: {
  leadId: string
  onOpenContact: (contactId: string) => void
  /** The list is read again after a change made here. */
  onChanged: () => Promise<void>
}) {
  const [bundle, setBundle] = React.useState<LeadBundle | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    loadLead(leadId)
      .then((read) => {
        if (!cancelled) setBundle(read)
      })
      .catch((error) => {
        if (cancelled) return
        setFailed(true)
        showErrorToast(getLeadErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [leadId, reloads])

  const changed = () => {
    setReloads((count) => count + 1)
    void onChanged()
  }

  if (!bundle) {
    return failed ? (
      <EmptyRecord title="Lead" icon={<UserIcon aria-hidden />} line="This lead could not be opened." hideLabel="Hide the person" />
    ) : (
      <EmptyRecord title="Lead" icon={null} line="" loading hideLabel="Hide the person" />
    )
  }

  const lead = bundle.lead
  const name = lead.name?.trim() || lead.email
  const save = async (patch: Omit<Parameters<typeof saveLead>[0], "leadId">) => {
    try {
      await saveLead({ leadId: lead.id, ...patch })
      changed()
    } catch (error) {
      showErrorToast(getLeadErrorMessage(error))
    }
  }

  return (
    <RecordFrame
      avatar={initialsFor(lead.name, lead.email)}
      title={name}
      line={lead.company?.trim() || (lead.name ? lead.email : null)}
      hideLabel="Hide the person"
      actions={
        <TabbedMenu
          label="Lead menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid gap-4 p-3">
                  <LeadFactGroups lead={lead} siteTags={bundle.siteTags} save={save} onLeadChanged={changed} />
                  {lead.contactId ? null : (
                    <div className="grid">
                      <AddToContactsRow leadId={lead.id} onAdded={changed} />
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <section className="grid gap-2" aria-label="Conversation">
          <h3 className="px-0.5 text-sm font-medium text-muted-foreground">Conversation</h3>
          <p className="px-0.5 text-sm text-muted-foreground">
            Nobody has written yet. Inbox, then New email, writes to them.
          </p>
          <p className="px-0.5 text-xs text-muted-foreground">Added {formatDate(lead.created_at)}</p>
        </section>
      }
      footer={
        <>
          <FooterState>
            <span className="truncate">
              {CRM_STAGE_LABELS[lead.stage]}
              {lead.valueCents > 0 ? `, ${formatMoney(lead.valueCents)}` : ""}
            </span>
          </FooterState>
          {lead.contactId ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenContact(lead.contactId ?? "")}>
              <UsersIcon className="size-4" />
              Open in Subscribers
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={adding}
              onClick={async () => {
                setAdding(true)
                try {
                  await addLeadToContactList(lead.id)
                  toast.success(`${lead.email} is on the mailing list now.`)
                  changed()
                } catch (error) {
                  showErrorToast(getLeadErrorMessage(error))
                } finally {
                  setAdding(false)
                }
              }}
            >
              <UserPlusIcon className="size-4" />
              {adding ? "Adding…" : "Add to subscribers"}
            </Button>
          )}
        </>
      }
    />
  )
}
