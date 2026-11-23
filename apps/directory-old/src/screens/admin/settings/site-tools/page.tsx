import { redirect } from '@/lib/navigation-server'

export default function SiteToolsRoute() {
  redirect('/admin/settings?tab=cron-jobs')
}
