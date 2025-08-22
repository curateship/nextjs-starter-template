import { createClient } from '@/lib/supabase/client'

export interface Theme {
  id: string
  name: string
  description: string | null
  status: 'active' | 'inactive' | 'development'
  metadata: any
  created_at: string
  updated_at: string
}

export interface CreateThemeData {
  name: string
  description?: string
  status?: 'active' | 'inactive' | 'development'
  metadata?: any
}

export interface UpdateThemeData {
  name?: string
  description?: string
  status?: 'active' | 'inactive' | 'development'
  metadata?: any
}

export class ThemeService {
  private supabase = createClient()

  async getAllThemes(): Promise<{ data: Theme[] | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('themes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Database error:', error)
        return { data: null, error: `Database error: ${error.message || JSON.stringify(error)}` }
      }

      return { data: data as Theme[], error: null }
    } catch (error) {
      console.error('Unexpected error:', error)
      return { data: null, error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  async getActiveThemes(): Promise<{ data: Theme[] | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('themes')
        .select('*')
        .eq('status', 'active')
        .order('name', { ascending: true })

      return { data: data as Theme[], error }
    } catch (error) {
      return { data: null, error }
    }
  }

  async getThemeById(id: string): Promise<{ data: Theme | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('themes')
        .select('*')
        .eq('id', id)
        .single()

      return { data: data as Theme, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  async createTheme(themeData: CreateThemeData): Promise<{ data: Theme | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('themes')
        .insert([{
          name: themeData.name,
          description: themeData.description || null,
          status: themeData.status || 'development',
          metadata: themeData.metadata || {}
        }])
        .select()
        .single()

      return { data: data as Theme, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  async updateTheme(id: string, updates: UpdateThemeData): Promise<{ data: Theme | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('themes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      return { data: data as Theme, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  async deleteTheme(id: string): Promise<{ error: any }> {
    try {
      const { error } = await this.supabase
        .from('themes')
        .delete()
        .eq('id', id)

      return { error }
    } catch (error) {
      return { error }
    }
  }

  async updateThemeStatus(id: string, status: 'active' | 'inactive' | 'development'): Promise<{ data: Theme | null; error: any }> {
    return this.updateTheme(id, { status })
  }

  async getThemesByStatus(status: 'active' | 'inactive' | 'development'): Promise<{ data: Theme[] | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .from('themes')
        .select('*')
        .eq('status', status)
        .order('name', { ascending: true })

      return { data: data as Theme[], error }
    } catch (error) {
      return { data: null, error }
    }
  }

  async getSystemStatistics(): Promise<{ data: any | null; error: any }> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_system_statistics')

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Helper function to get theme status badge color
  getStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-red-100 text-red-800'
      case 'development':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Helper function to get theme status icon
  getStatusIcon(status: string): string {
    switch (status) {
      case 'active':
        return '✓'
      case 'inactive':
        return '×'
      case 'development':
        return '⚠'
      default:
        return '?'
    }
  }
}

// Export singleton instance
export const themeService = new ThemeService()