import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listAgents, type AgentItem } from "@/lib/api/agents"
import {
  listContactLists,
  type ContactListItem,
} from "@/lib/api/contact-lists"
import {
  createCampaign,
  getCampaignErrorMessage,
  type CampaignItem,
} from "@/lib/api/campaigns"
import { getProviderStatus, type PhoneNumberItem } from "@/lib/api/provider"

// New campaign: pick the list to call, the agent that talks, and the number
// to call from. Launching happens on the campaign's detail page.
export function CampaignWizardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (campaign: CampaignItem) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
          <DialogDescription>A campaign calls every contact on a list with one of your agents.</DialogDescription>
        </DialogHeader>
        {open ? (
          <CampaignWizardContent
            onCreated={onCreated}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type WizardData = {
  agents: AgentItem[]
  lists: ContactListItem[]
  phoneNumbers: PhoneNumberItem[]
}

function CampaignWizardContent({
  onCreated,
  onClose,
}: {
  onCreated: (campaign: CampaignItem) => void
  onClose: () => void
}) {
  const [data, setData] = React.useState<WizardData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [agentId, setAgentId] = React.useState("")
  const [listId, setListId] = React.useState("")
  const [phoneNumberId, setPhoneNumberId] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    let active = true
    Promise.all([listAgents(), listContactLists(), getProviderStatus()])
      .then(([agents, lists, provider]) => {
        if (!active) return
        setData({
          agents: agents.agents,
          lists: lists.lists,
          phoneNumbers: provider.phone_numbers,
        })
        if (agents.agents.length === 1) setAgentId(agents.agents[0].id)
        if (lists.lists.length === 1) setListId(lists.lists[0].id)
        if (provider.phone_numbers.length === 1)
          setPhoneNumberId(provider.phone_numbers[0].id)
      })
      .catch((loadError) => {
        if (active) setError(getCampaignErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [])

  if (!data) {
    return (
      <DialogBody>
        {error ? (
          <ErrorAlert message={error} />
        ) : (
          <div className="flex justify-center py-8">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogBody>
    )
  }

  // Prerequisites: at least one agent, one list, one number.
  const missing: React.ReactNode[] = []
  if (data.agents.length === 0) {
    missing.push(
      <span key="agents">
        an{" "}
        <Link to="/admin/agents" className="underline underline-offset-2" onClick={onClose}>
          agent
        </Link>
      </span>
    )
  }
  if (data.lists.length === 0) {
    missing.push(
      <span key="lists">
        a{" "}
        <Link to="/admin/contacts" className="underline underline-offset-2" onClick={onClose}>
          contact list
        </Link>
      </span>
    )
  }
  if (data.phoneNumbers.length === 0) {
    missing.push(
      <span key="numbers">
        a{" "}
        <Link to="/admin/settings/$tab" params={{ tab: "voice-provider" }} className="underline underline-offset-2" onClick={onClose}>
          phone number
        </Link>
      </span>
    )
  }
  if (missing.length > 0) {
    return (
      <>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Before creating a campaign you need{" "}
            {missing.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 ? (index === missing.length - 1 ? " and " : ", ") : ""}
                {item}
              </React.Fragment>
            ))}
            .
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }

  const selectedList = data.lists.find((list) => list.id === listId)
  const canCreate = Boolean(name && agentId && listId && phoneNumberId && !creating)

  async function handleCreate() {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const campaign = await createCampaign({
        name,
        agentId,
        contactListId: listId,
        phoneNumberId,
      })
      onCreated(campaign)
      onClose()
    } catch (createError) {
      setError(getCampaignErrorMessage(createError))
      setCreating(false)
    }
  }

  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          {error ? <ErrorAlert message={error} /> : null}
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={name}
              placeholder="e.g. June appointment reminders"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-list">Call this list</Label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger id="campaign-list" className="w-full">
                <SelectValue placeholder="Select a contact list" />
              </SelectTrigger>
              <SelectContent>
                {data.lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name} ({list.member_count}{" "}
                    {list.member_count === 1 ? "contact" : "contacts"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-agent">With this agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger id="campaign-agent" className="w-full">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {data.agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="campaign-number">Calling from</Label>
            <Select value={phoneNumberId} onValueChange={setPhoneNumberId}>
              <SelectTrigger id="campaign-number" className="w-full">
                <SelectValue placeholder="Select a phone number" />
              </SelectTrigger>
              <SelectContent>
                {data.phoneNumbers.map((number) => (
                  <SelectItem key={number.id} value={number.id}>
                    {number.number}
                    {number.name ? ` — ${number.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedList ? (
            <p className="text-xs text-muted-foreground">
              The campaign is created as a draft — you review and launch it on the
              next screen. Do-not-call contacts are skipped automatically.
            </p>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!canCreate} onClick={handleCreate}>
          {creating ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {creating ? "Creating" : "Create Campaign"}
        </Button>
      </DialogFooter>
    </>
  )
}

