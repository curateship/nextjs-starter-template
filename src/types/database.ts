// Database types for the simplified System Everything platform

export interface Profile {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  created_at: string
}

export interface Site {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
}

export interface CreateSiteData {
  name: string
  description?: string
}

export interface UpdateSiteData {
  name?: string
  description?: string
}