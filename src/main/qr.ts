import { spawn } from 'child_process'
import { nativeImage, type NativeImage } from 'electron'
import jsQR from 'jsqr'

function decodeImage(img: NativeImage): string {
  if (img.isEmpty()) throw new Error('Не удалось прочитать изображение')
  const { width, height } = img.getSize()
  const bgra = img.toBitmap()
  const rgba = new Uint8ClampedArray(bgra.length)
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i] = bgra[i + 2]
    rgba[i + 1] = bgra[i + 1]
    rgba[i + 2] = bgra[i]
    rgba[i + 3] = bgra[i + 3]
  }
  const result = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' })
  bgra.fill(0)
  rgba.fill(0)
  if (!result) throw new Error('QR-код на изображении не найден')
  if (result.data.startsWith('otpauth-migration://')) {
    throw new Error('Экспорт Google Authenticator (otpauth-migration) не поддерживается')
  }
  return result.data
}

export function decodeQrFile(path: string): string {
  return decodeImage(nativeImage.createFromPath(path))
}

/** Выделение области экрана через slurp + снимок через grim (Hyprland/wlroots). */
export function decodeQrFromScreen(): Promise<string> {
  if (process.platform === 'win32') {
    return Promise.reject(new Error('На Windows выделение области экрана не поддерживается — выберите файл с QR-кодом'))
  }
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', 'grim -g "$(slurp)" -'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.includes('not found') ? 'Нужны grim и slurp' : 'Выделение отменено'))
        return
      }
      try {
        const buf = Buffer.concat(chunks)
        resolve(decodeImage(nativeImage.createFromBuffer(buf)))
        buf.fill(0)
      } catch (e) {
        reject(e)
      }
    })
  })
}
