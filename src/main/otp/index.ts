import type { Account, CodeView } from '@shared/types'
import { base32Decode } from './base32'
import { totp } from './totp'
import { yandexOtp } from './yandex'

export function generateCode(account: Account, now = Date.now()): CodeView {
  const seconds = Math.floor(now / 1000)
  const remaining = account.period - (seconds % account.period)
  const key = base32Decode(account.secret)
  try {
    if (account.type === 'yandex') {
      if (!account.pin) return { code: null, remaining, period: account.period }
      return { code: yandexOtp(key, account.pin, seconds), remaining, period: account.period }
    }
    return { code: totp(key, seconds, account.period, account.digits, account.algo), remaining, period: account.period }
  } finally {
    key.fill(0)
  }
}
