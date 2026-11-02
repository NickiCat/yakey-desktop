export type PasswordPolicy = 'complex' | 'normal' | 'short'

export const POLICY_HINTS: Record<PasswordPolicy, string> = {
  complex: 'от 12 символов, минимум 3 типа: строчные, заглавные, цифры, символы',
  normal: 'от 8 символов',
  short: 'от 4 символов (PIN)'
}

function classes(pw: string): number {
  return [/[a-zа-яё]/, /[A-ZА-ЯЁ]/, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(pw)).length
}

/** null — пароль подходит под политику, иначе текст ошибки. */
export function checkPassword(pw: string, policy: PasswordPolicy): string | null {
  const len = [...pw].length
  switch (policy) {
    case 'complex':
      if (len < 12) return 'Нужно не меньше 12 символов'
      if (classes(pw) < 3) return 'Нужны минимум 3 типа символов: строчные, заглавные, цифры, символы'
      return null
    case 'normal':
      return len < 8 ? 'Нужно не меньше 8 символов' : null
    case 'short':
      return len < 4 ? 'Нужно не меньше 4 символов' : null
  }
}
