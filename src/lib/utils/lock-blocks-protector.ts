/**
 * Helper utilities for block management
 */

/**
 * Helper function to check if block type is protected from deletion
 */
export function isBlockTypeProtected(blockType: string): boolean {
  return blockType === 'navigation' || blockType === 'footer'
}

/**
 * Helper function to get protection reason for block type
 */
export function getBlockProtectionReason(blockType: string): string {
  switch (blockType) {
    case 'navigation':
      return 'Navigation is required for site structure'
    case 'footer':
      return 'Footer is required for complete website'
    default:
      return 'This block type is protected'
  }
}