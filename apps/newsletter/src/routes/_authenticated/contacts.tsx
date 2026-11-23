import { createFileRoute } from "@tanstack/react-router"

import { ContactsPage } from "@/components/contacts-page"

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
})
