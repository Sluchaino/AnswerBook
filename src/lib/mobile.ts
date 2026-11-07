import { Capacitor, registerPlugin } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export const isAndroid = Capacitor.getPlatform() === 'android'
const PrintDocument = registerPlugin<{ print(): Promise<void> }>('PrintDocument')

export async function shareText(text: string) {
  const path = `kodshag-${new Date().toISOString().slice(0, 10)}.txt`
  const { uri } = await Filesystem.writeFile({ path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
  await Share.share({ title: 'Мои ответы — КодШаг', files: [uri], dialogTitle: 'Сохранить или отправить конспект' })
}

export async function printDocument() {
  if (isAndroid) await PrintDocument.print()
  else window.print()
}
