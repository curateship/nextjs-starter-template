import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { UnsubscribeForm } from "./UnsubscribeForm"

export const metadata = {
  title: "Unsubscribe",
  description: "Manage your email preferences",
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; site?: string; token?: string; newsletter?: string }>
}) {
  const params = await searchParams
  const { site } = await getSiteFromHeaders()

  const siteId = params.site || site?.id
  const email = params.email || ""
  const token = params.token || ""
  const newsletterId = params.newsletter || ""

  if (!siteId || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Unable to process request</h1>
          <p className="text-gray-600">Invalid unsubscribe link.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border p-8">
        <UnsubscribeForm siteId={siteId} initialEmail={email} token={token} newsletterId={newsletterId} siteName={site?.name || ""} />
      </div>
    </div>
  )
}
