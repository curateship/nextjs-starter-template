const ACCOUNT_PAGE_BLOCK_TYPE_KEYS = ['auth', 'rich-text', 'faq', 'divider', 'account-edit-profile', 'account-claimed-listings'] as const

const ACCOUNT_PAGE_BLOCK_TYPE_SET = new Set<string>(ACCOUNT_PAGE_BLOCK_TYPE_KEYS)

export function isSupportedAccountPageBlockType(type: string | null | undefined) {
  return !!type && ACCOUNT_PAGE_BLOCK_TYPE_SET.has(type)
}
