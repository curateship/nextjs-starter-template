/**
 * How wide the editor draws the email.
 *
 * 600 because that is the width `renderBroadcastEmailHtml` actually writes into
 * the message. Any other number would make the preview a lie about where the
 * lines wrap. 375 is a phone, which is where most people will read it.
 *
 * In a file of its own, not beside the canvas, because a component file that
 * also exports constants breaks hot reloading.
 */
export const PREVIEW_WIDTHS = { desktop: 600, mobile: 375 } as const

export type PreviewWidth = keyof typeof PREVIEW_WIDTHS
