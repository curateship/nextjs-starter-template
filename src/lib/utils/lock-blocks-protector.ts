/**
 * Check if a block type should be locked from drag reordering.
 * Navigation and footer blocks have fixed positions (first and last).
 */
export function isBlockTypeProtected(blockType: string): boolean {
  return blockType === 'navigation' || blockType === 'footer'
}
