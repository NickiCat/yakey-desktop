import { randomBytes, scryptSync } from 'crypto'
import { mkdtempSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import { checkPassword } from '../src/shared/password'
import { decryptBackup } from '../src/main/backup/decrypt'
import { base32Decode, base32Encode } from '../src/main/otp/base32'
import { totp } from '../src/main/otp/totp'
import { yandexOtp } from '../src/main/otp/yandex'
import { buildOtpauth, parseOtpauth } from '../src/main/uri'
import { Vault } from '../src/main/vault'

describe('TOTP — RFC 6238, приложение B', () => {
  const keys = {
    SHA1: Buffer.from('12345678901234567890'),
    SHA256: Buffer.from('12345678901234567890123456789012'),
    SHA512: Buffer.from('1234567890'.repeat(6) + '1234')
  } as const
  const vectors: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826']
  ]
  for (const [t, sha1, sha256, sha512] of vectors) {
    it(`t=${t}`, () => {
      expect(totp(keys.SHA1, t, 30, 8, 'SHA1')).toBe(sha1)
      expect(totp(keys.SHA256, t, 30, 8, 'SHA256')).toBe(sha256)
      expect(totp(keys.SHA512, t, 30, 8, 'SHA512')).toBe(sha512)
    })
  }
})

describe('Yandex OTP — векторы из Aegis (YAOTPTest)', () => {
  const vectors: [string, string, number, string][] = [
    ['5239', '6SB2IKNM6OBZPAVBVTOHDKS4FAAAAAAADFUTQMBTRY', 1641559648, 'umozdicq'],
    ['7586', 'LA2V6KMCGYMWWVEW64RNP3JA3IAAAAAAHTSG4HRZPI', 1581064020, 'oactmacq'],
    ['7586', 'LA2V6KMCGYMWWVEW64RNP3JA3IAAAAAAHTSG4HRZPI', 1581090810, 'wemdwrix'],
    ['5210481216086702', 'JBGSAU4G7IEZG6OY4UAXX62JU4AAAAAAHTSG4HXU3M', 1581091469, 'dfrpywob'],
    ['5210481216086702', 'JBGSAU4G7IEZG6OY4UAXX62JU4AAAAAAHTSG4HXU3M', 1581093059, 'vunyprpd']
  ]
  for (const [pin, secret, t, expected] of vectors) {
    it(`${expected}`, () => expect(yandexOtp(base32Decode(secret), pin, t)).toBe(expected))
  }
})

describe('base32', () => {
  it('round-trip', () => {
    const data = randomBytes(26)
    expect(base32Decode(base32Encode(data)).equals(data)).toBe(true)
  })
  it('игнорирует пробелы, регистр и паддинг', () => {
    expect(base32Decode('jbsw y3dp ehpk 3pxp==').equals(base32Decode('JBSWY3DPEHPK3PXP'))).toBe(true)
  })
})

describe('otpauth://', () => {
  it('totp с issuer в метке', () => {
    const p = parseOtpauth('otpauth://totp/GitHub:me%40mail.ru?secret=JBSWY3DPEHPK3PXP&digits=8&algorithm=SHA256')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.account).toMatchObject({ issuer: 'GitHub', name: 'me@mail.ru', digits: 8, algo: 'SHA256', period: 30 })
  })
  it('yaotp с pin_length', () => {
    const p = parseOtpauth('otpauth://yaotp/user?secret=LA2V6KMCGYMWWVEW64RNP3JA3IAAAAAAHTSG4HRZPI&name=user&pin_length=4')
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.account.type).toBe('yandex')
    expect(p.pinLength).toBe(4)
    expect(p.account.pin).toBeUndefined()
  })
  it('round-trip yaotp с PIN', () => {
    const p = parseOtpauth('otpauth://yaotp/user?secret=LA2V6KMCGYMWWVEW64RNP3JA3IAAAAAAHTSG4HRZPI')
    if (!p.ok) throw new Error(p.reason)
    const again = parseOtpauth(buildOtpauth({ ...p.account, pin: '7586' }))
    expect(again.ok && again.account.pin).toBe('7586')
  })
  it('hotp не поддерживается', () => {
    expect(parseOtpauth('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1').ok).toBe(false)
  })
})

describe('бэкап Яндекс Ключа', () => {
  // собираем блоб тем же форматом, что ожидает Decryptor.cs: nonce | MAC | ciphertext | salt
  function makeBackup(text: string, password: string): string {
    const salt = randomBytes(16)
    const nonce = randomBytes(24)
    const key = scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N: 32768, r: 20, p: 1, maxmem: 256 * 1024 * 1024 })
    const box = nacl.secretbox(Buffer.from(text, 'utf8'), nonce, key)
    return Buffer.concat([nonce, box, salt]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  it('расшифровка и неверный пароль', async () => {
    const text = 'otpauth://totp/a?secret=JBSWY3DPEHPK3PXP\notpauth://yaotp/b?secret=LA2V6KMCGYMWWVEW64RNP3JA3IAAAAAAHTSG4HRZPI'
    const blob = makeBackup(text + '\0\0', 'пароль')
    expect(await decryptBackup(blob, 'пароль')).toBe(text)
    expect(await decryptBackup(blob, 'другой')).toBeNull()
  }, 30_000)
})

describe('хранилище', () => {
  it('создание, разблокировка, отсутствие открытого текста', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yakey-'))
    const path = join(dir, 'yakey', 'vault.bin')
    const v = new Vault(path)
    await v.create('correct horse')
    await v.setAccounts([
      { id: '1', name: 'github', issuer: 'GitHub', type: 'totp', secret: 'JBSWY3DPEHPK3PXP', algo: 'SHA1', digits: 6, period: 30 }
    ])
    v.lock()

    const raw = readFileSync(path)
    expect(raw.includes(Buffer.from('JBSWY3DPEHPK3PXP'))).toBe(false)
    expect(raw.includes(Buffer.from('github'))).toBe(false)
    expect(statSync(path).mode & 0o777).toBe(0o600)

    await expect(new Vault(path).unlock('wrong')).rejects.toMatchObject({ code: 'bad-password' })
    const v2 = new Vault(path)
    await v2.unlock('correct horse')
    expect(v2.list()[0].secret).toBe('JBSWY3DPEHPK3PXP')

    // мягкая блокировка: данные стёрты, ключ в памяти, открывается без пароля
    v2.lock(60_000)
    expect(v2.unlocked).toBe(false)
    expect(() => v2.list()).toThrow()
    expect(v2.quickUnlockAvailable).toBe(true)
    await v2.quickUnlock()
    expect(v2.list()[0].name).toBe('github')

    // полная блокировка: ключ стёрт
    v2.lock(0)
    expect(v2.quickUnlockAvailable).toBe(false)
    await expect(v2.quickUnlock()).rejects.toMatchObject({ code: 'locked' })
  }, 30_000)
})

describe('политика мастер-пароля', () => {
  it('сложный', () => {
    expect(checkPassword('Short1!', 'complex')).not.toBeNull()
    expect(checkPassword('alllowercaseletters', 'complex')).not.toBeNull()
    expect(checkPassword('Correct-horse-42', 'complex')).toBeNull()
    expect(checkPassword('Пароль-длинный-7', 'complex')).toBeNull()
  })
  it('обычный и короткий', () => {
    expect(checkPassword('1234567', 'normal')).not.toBeNull()
    expect(checkPassword('12345678', 'normal')).toBeNull()
    expect(checkPassword('123', 'short')).not.toBeNull()
    expect(checkPassword('1234', 'short')).toBeNull()
  })
})

describe('хранилище: смена пароля и открытие ключом', () => {
  it('setPassword и unlockWithKey', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'yakey-')), 'vault.bin')
    const v = new Vault(path)
    await v.create('old password')
    const key = v.exportKey()
    expect(await v.verifyPassword('old password')).toBe(true)
    expect(await v.verifyPassword('nope')).toBe(false)

    // режим без пароля: открываем сохранённым ключом
    v.lock(0)
    const byKey = new Vault(path)
    await byKey.unlockWithKey(key)
    expect(byKey.unlocked).toBe(true)

    // включаем пароль обратно: старый пароль и старый ключ больше не подходят
    await byKey.setPassword('1234')
    byKey.lock(0)
    await expect(new Vault(path).unlock('old password')).rejects.toMatchObject({ code: 'bad-password' })
    await expect(new Vault(path).unlockWithKey(key)).rejects.toMatchObject({ code: 'bad-password' })
    await new Vault(path).unlock('1234')
  }, 60_000)
})
