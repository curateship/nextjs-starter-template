import * as React from "react"

import { usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { TextPickRow } from "@/components/dashboard-page/text-pick-row"
import { PickGroup, PickMenuRow, RowButton } from "@/components/shared/notes/pick-rows"
import {
  getPhoneErrorMessage,
  savePhoneFields,
  type PhoneFormInput,
  type PhoneRecord,
  type PhonesPage,
} from "@/lib/api/phones/phones"
import { NONE } from "@/lib/browser/sorting"
import { formatTimeAgo } from "@/lib/format/format-time"
import { PHONE_KIND_WORDS, PHONE_KINDS, type PhoneConnection, type PhoneKind } from "@/lib/phones/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The phone's Settings, in its ⋮ (Racks dashboard, part 111), drawn as every
 * settings list in the ⋮ is (Tyler, 12 Nov 2026: "the settings should use
 * this ui"): a small heading over each grey list of rows, each row its name
 * and what it holds. A typed field opens in a small box from its row and
 * saves when it is left or Enter is pressed; a choice drops its list from
 * the row and saves the moment it is picked. There is no Save button. Only
 * the field that changed is sent, so the rack's own readings, such as the
 * system version, are never written back from an older copy. A refused save
 * keeps what was typed and says why.
 */
export function PhoneSettingsSection({
  phone,
  page,
  onSaved,
  part = "all",
}: {
  phone: PhoneRecord
  page: Pick<PhonesPage, "folders" | "labels" | "proxies">
  onSaved: () => Promise<void>
  /**
   * Which rows: "phone" is Name, Kind, Model, the system version, the serial
   * and Notes alone, at the bottom of the phone on its Phone tab (Tyler, 12
   * Nov 2026: "move these info to the bottom of the phone"); "rest" is every
   * other group, in the ⋮'s Settings.
   */
  part?: "all" | "phone" | "rest"
}) {
  const setSaveStatus = usePromoSaveStatus()
  // A pick shows at once and goes back if the save is refused.
  const [kind, setKind] = React.useState<PhoneKind>(phone.kind)
  const [connection, setConnection] = React.useState<PhoneConnection>(phone.connection)
  const [proxyId, setProxyId] = React.useState(phone.proxy?.id ?? NONE)
  const [folderId, setFolderId] = React.useState(phone.folderId ?? NONE)
  const [labelId, setLabelId] = React.useState(phone.labelId ?? NONE)

  const send = React.useCallback(
    async (patch: Partial<PhoneFormInput>, undo?: () => void) => {
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        await savePhoneFields(phone.id, patch)
        setSaveStatus("saved")
        await onSaved()
        return true
      } catch (error) {
        setSaveStatus("idle")
        undo?.()
        showErrorToast(getPhoneErrorMessage(error))
        return false
      }
    },
    [onSaved, phone.id, setSaveStatus]
  )

  const orNull = (value: string) => (value === NONE ? null : value)
  const iphone = kind === "iphone"
  const field = (name: string) => `phone-${name}-${phone.id}`
  const pick = <T extends string>(set: (value: T) => void, before: T, patch: (value: T) => Partial<PhoneFormInput>) => (next: string) => {
    set(next as T)
    void send(patch(next as T), () => set(before))
  }
  const proxyName = (id: string) => {
    const proxy = page.proxies.find((one) => one.id === id)
    return proxy ? proxy.label || proxy.host : "The house's own address"
  }

  const phoneRows = (
    <>
        <TextPickRow
          id={field("name")}
          label="Name"
          value={phone.name}
          placeholder="Pixel 8a"
          onSave={async (text) => {
            if (!text.trim()) {
              showErrorToast("A phone needs a name. What was there before is kept until you type one.")
              return false
            }
            return send({ name: text })
          }}
        />
        <PickMenuRow
          label="Kind"
          value={PHONE_KIND_WORDS[kind]}
          options={PHONE_KINDS.map((one) => ({ value: one, label: PHONE_KIND_WORDS[one] }))}
          selected={kind}
          onPick={pick(setKind, kind, (next) => ({ kind: next }))}
        />
        <TextPickRow id={field("model")} label="Model" value={phone.model} onSave={(text) => send({ model: text })} />
        <TextPickRow
          id={field("androidVersion")}
          label={iphone ? "iOS version" : "Android version"}
          value={phone.androidVersion}
          placeholder={iphone ? "17.6" : "16"}
          onSave={(text) => send({ androidVersion: text })}
        />
        <TextPickRow
          id={field("serial")}
          label={iphone ? "UDID" : "Serial number"}
          value={phone.serial}
          placeholder="Filled in when the rack sees it"
          onSave={(text) => send({ serial: text })}
        />
        <TextPickRow id={field("notes")} label="Notes" value={phone.notes} multiline onSave={(text) => send({ notes: text })} />
    </>
  )

  // Rows with a line between each, as a group's list is, on the phone's own grey.
  if (part === "phone") return <div className="divide-y">{phoneRows}</div>

  return (
    <div className="grid min-w-0 gap-3">
      {part === "rest" ? null : <PickGroup title="The phone">{phoneRows}</PickGroup>}

      <PickGroup
        title="Where it sits"
        after={
          <p className="px-0.5 text-xs text-muted-foreground">
            Type the slot once, or click an empty slot on the Shelf tab. The rack fills in the USB port, and moving the
            cable updates it by itself.
          </p>
        }
      >
        <TextPickRow id={field("shelfSlot")} label="Shelf slot" value={phone.shelfSlot} placeholder="4" onSave={(text) => send({ shelfSlot: text })} />
        <RowButton label="USB port" value={phone.usbPort || "Not plugged in yet"} empty={!phone.usbPort} disabled open={false} />
        <RowButton label="Last seen" value={phone.lastSeenAt ? formatTimeAgo(phone.lastSeenAt) : "Never"} empty={!phone.lastSeenAt} disabled open={false} />
      </PickGroup>

      <PickGroup title="How it goes online">
        <PickMenuRow
          label="Connection"
          value={connection === "sim" ? "Its own SIM" : "The house Wi-Fi"}
          options={[
            { value: "sim", label: "Its own SIM" },
            { value: "wifi", label: "The house Wi-Fi" },
          ]}
          selected={connection}
          onPick={pick(setConnection, connection, (next) => ({ connection: next, proxyId: next === "wifi" ? orNull(proxyId) : null }))}
        />
        {connection === "sim" ? (
          <>
            <TextPickRow id={field("simCarrier")} label="SIM carrier" value={phone.simCarrier} placeholder="Mint Mobile" onSave={(text) => send({ simCarrier: text })} />
            <TextPickRow id={field("simNumber")} label="SIM number" value={phone.simNumber} onSave={(text) => send({ simNumber: text })} />
          </>
        ) : (
          <PickMenuRow
            label="Goes out through"
            value={proxyName(proxyId)}
            options={[{ value: NONE, label: "The house's own address" }, ...page.proxies.map((proxy) => ({ value: proxy.id, label: proxy.label || proxy.host }))]}
            selected={proxyId}
            onPick={pick(setProxyId, proxyId, (next) => ({ proxyId: orNull(next) }))}
          />
        )}
      </PickGroup>

      <PickGroup title="Sorting">
        <PickMenuRow
          label="Folder"
          value={page.folders.find((folder) => folder.id === folderId)?.name ?? "None"}
          empty={folderId === NONE}
          options={[{ value: NONE, label: "No folder" }, ...page.folders.map((folder) => ({ value: folder.id, label: folder.name }))]}
          selected={folderId}
          onPick={pick(setFolderId, folderId, (next) => ({ folderId: orNull(next) }))}
        />
        <PickMenuRow
          label="Label"
          value={page.labels.find((label) => label.id === labelId)?.name ?? "None"}
          empty={labelId === NONE}
          options={[{ value: NONE, label: "No label" }, ...page.labels.map((label) => ({ value: label.id, label: label.name }))]}
          selected={labelId}
          onPick={pick(setLabelId, labelId, (next) => ({ labelId: orNull(next) }))}
        />
        <TextPickRow
          id={field("tags")}
          label="Tags"
          value={phone.tags.join(", ")}
          placeholder="important, us-east"
          onSave={(text) => send({ tags: text.split(",") })}
        />
      </PickGroup>
    </div>
  )
}
