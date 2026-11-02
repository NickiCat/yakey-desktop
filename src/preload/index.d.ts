import type { YakeyApi } from '../shared/api'

declare global {
  interface Window {
    yakey: YakeyApi
  }
}
