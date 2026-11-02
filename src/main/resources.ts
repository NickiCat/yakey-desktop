import { app } from 'electron'
import { join } from 'path'

/** Путь к файлу из resources/: в пакете он лежит в process.resourcesPath (extraResources). */
export function resourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '../../resources', name)
}
