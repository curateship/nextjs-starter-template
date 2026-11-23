import { BlockList, isIP } from 'node:net'

const blockedIpv4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) blockedIpv4.addSubnet(address, prefix, 'ipv4')

const blockedIpv6 = new BlockList()
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) blockedIpv6.addSubnet(address, prefix, 'ipv6')

export function isBlockedAutomationHostname(hostname: string) {
  const normalized = normalizeHostname(hostname)
  return normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local') || normalized.endsWith('.internal')
}

export function isBlockedAutomationAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return blockedIpv4.check(address, 'ipv4')
  if (version === 6) return blockedIpv6.check(address, 'ipv6')
  return true
}

export function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, '')
}
