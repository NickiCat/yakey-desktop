import { createHmac } from 'crypto'
import type { Algo } from '@shared/types'

export function hotp(key: Uint8Array, counter: number, digits: number, algo: Algo): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac(algo.toLowerCase(), key).update(msg).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const bin = mac.readUInt32BE(offset) & 0x7fffffff
  const code = bin % 10 ** digits
  mac.fill(0)
  return code.toString().padStart(digits, '0')
}

/** RFC 6238 */
export function totp(key: Uint8Array, unixSeconds: number, period = 30, digits = 6, algo: Algo = 'SHA1'): string {
  return hotp(key, Math.floor(unixSeconds / period), digits, algo)
}
