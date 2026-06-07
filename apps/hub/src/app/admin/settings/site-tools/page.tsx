import { redirect } from 'next/navigation'

export default function SiteToolsRoute() {
  redirect('/admin/settings?tab=cron-jobs')
}
