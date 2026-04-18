export const DIRECTORY_CONTACT_BUTTON_TYPES = ['website', 'phone', 'email'] as const

export type DirectoryContactButtonType = typeof DIRECTORY_CONTACT_BUTTON_TYPES[number]

export interface DirectoryContactButton {
  id: string
  type: DirectoryContactButtonType
  label?: string
  value?: string
}

export interface DirectoryClaimButton {
  enabled?: boolean
  label?: string
  url?: string
}

export function buildDirectoryActionHref(value?: string | null): string {
  const trimmedValue = value?.trim() || ''
  if (!trimmedValue) return ''

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedValue) || trimmedValue.startsWith('//') || trimmedValue.startsWith('/')) {
    return trimmedValue
  }

  return `https://${trimmedValue}`
}

export function getDirectoryContactTypeLabel(type: DirectoryContactButtonType): string {
  switch (type) {
    case 'website':
      return 'Website'
    case 'phone':
      return 'Phone'
    case 'email':
      return 'Email'
  }
}

export function getDirectoryContactValuePlaceholder(type: DirectoryContactButtonType): string {
  switch (type) {
    case 'website':
      return 'example.com'
    case 'phone':
      return '(555) 123-4567'
    case 'email':
      return 'hello@example.com'
  }
}

export function getDirectoryContactButtonLabel(button: DirectoryContactButton): string {
  const label = button.label?.trim()
  if (label) return label
  return getDirectoryContactTypeLabel(button.type)
}

export function buildDirectoryContactHref(button: DirectoryContactButton): string {
  const value = button.value?.trim() || ''
  if (!value) return ''

  switch (button.type) {
    case 'website':
      if (/^[a-z]+:\/\//i.test(value) || value.startsWith('//')) {
        return value
      }
      return `https://${value}`
    case 'phone':
      return `tel:${value.replace(/[^\d+]/g, '') || value}`
    case 'email':
      return `mailto:${value}`
  }
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//')
}
