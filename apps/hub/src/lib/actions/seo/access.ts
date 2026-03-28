export interface SeoAccessSnapshot {
  hub_user_id: string
  email: string
  role: string
  seo_access: boolean
}

export function getSeoAccessSnapshot(user: {
  id: string
  email: string
  role?: string | null
}): SeoAccessSnapshot {
  const role = user.role ?? 'end_user'

  return {
    hub_user_id: user.id,
    email: user.email,
    role,
    seo_access: role === 'super_admin',
  }
}
