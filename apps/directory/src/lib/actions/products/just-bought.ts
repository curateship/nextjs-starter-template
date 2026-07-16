export interface ProductJustBoughtMessage {
  id: string
  avatar: string
  buyerName: string
  action: string
  productText: string
  timeText: string
}

export const PRODUCT_JUST_BOUGHT_DEFAULT_CONTENT = {
  messages: [
    {
      id: 'message-1',
      avatar: '',
      buyerName: 'Justin Lee',
      action: 'bought',
      productText: '{{product_name}}',
      timeText: '1 hour ago',
    },
    {
      id: 'message-2',
      avatar: '',
      buyerName: 'Maya Chen',
      action: 'bought',
      productText: '{{product_name}}',
      timeText: '24 minutes ago',
    },
    {
      id: 'message-3',
      avatar: '',
      buyerName: 'Alex Morgan',
      action: 'bought',
      productText: '{{product_name}}',
      timeText: 'just now',
    },
  ] satisfies ProductJustBoughtMessage[],
  intervalSeconds: 12,
  durationSeconds: 5,
  loop: true,
  visibility: {},
}

export function normalizeProductJustBoughtContent(content?: Record<string, any> | null) {
  const source = content && typeof content === 'object' ? content : {}
  const visibility = source.visibility && typeof source.visibility === 'object'
    ? source.visibility
    : {}
  const messages = Array.isArray(source.messages)
    ? source.messages
        .filter((message): message is Record<string, any> => message && typeof message === 'object')
        .map((message, index) => ({
          id: typeof message.id === 'string' && message.id ? message.id : `message-${index + 1}`,
          avatar: typeof message.avatar === 'string' ? message.avatar : '',
          buyerName: typeof message.buyerName === 'string' ? message.buyerName : '',
          action: typeof message.action === 'string' ? message.action : 'bought',
          productText: typeof message.productText === 'string' ? message.productText : '{{product_name}}',
          timeText: typeof message.timeText === 'string' ? message.timeText : 'just now',
        }))
    : PRODUCT_JUST_BOUGHT_DEFAULT_CONTENT.messages

  return {
    ...PRODUCT_JUST_BOUGHT_DEFAULT_CONTENT,
    ...source,
    messages,
    intervalSeconds: typeof source.intervalSeconds === 'number'
      ? Math.max(1, source.intervalSeconds)
      : PRODUCT_JUST_BOUGHT_DEFAULT_CONTENT.intervalSeconds,
    durationSeconds: typeof source.durationSeconds === 'number'
      ? Math.max(1, source.durationSeconds)
      : PRODUCT_JUST_BOUGHT_DEFAULT_CONTENT.durationSeconds,
    loop: typeof source.loop === 'boolean' ? source.loop : PRODUCT_JUST_BOUGHT_DEFAULT_CONTENT.loop,
    visibility,
  }
}

export function renderProductJustBoughtToken(value: string | undefined, productTitle: string) {
  return (value || '').replaceAll('{{product_name}}', productTitle)
}
