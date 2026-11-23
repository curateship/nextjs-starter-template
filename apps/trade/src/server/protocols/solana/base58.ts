/**
 * Base58, the alphabet Solana writes addresses and secret keys in.
 *
 * Written here rather than pulled in as a package: it is thirty lines, the
 * only two callers are in this folder, and `@solana/web3.js` does not
 * export its own copy. The alphabet is Bitcoin's, which Solana shares — no
 * 0, O, I or l, so a pasted key cannot be misread between the four.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

const INDEX = new Map([...ALPHABET].map((char, index) => [char, index]))

/** The bytes a base58 string spells, or null when a character is not base58. */
export function decodeBase58(text: string): Uint8Array | null {
  const digits: number[] = []
  for (const char of text) {
    const value = INDEX.get(char)
    if (value === undefined) return null
    let carry = value
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] * 58
      digits[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      digits.push(carry & 0xff)
      carry >>= 8
    }
  }
  // Each leading "1" is a leading zero byte, which the arithmetic above
  // cannot carry on its own.
  let leadingZeros = 0
  for (const char of text) {
    if (char !== "1") break
    leadingZeros += 1
  }
  const bytes = new Uint8Array(leadingZeros + digits.length)
  bytes.set(digits.reverse(), leadingZeros)
  return bytes
}

export function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = []
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let text = ""
  for (const byte of bytes) {
    if (byte !== 0) break
    text += "1"
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) text += ALPHABET[digits[i]]
  return text
}
