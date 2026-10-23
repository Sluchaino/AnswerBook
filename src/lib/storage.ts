import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import learningCatalog from '../data/learning-catalog.json'
import { learningStorageKey } from './learning'
export { learningStorageKey } from './learning'

export const sessionKey = 'answerbook.session.v1'
export const customTopicsKey = 'answerbook.custom-topics.v1'
export const catalogKey = 'answerbook.catalog.v1'
export const profileKey = 'answerbook.profile.v1'
export const knowledgeKey = 'answerbook.knowledge.v1'
export const activityKey = 'answerbook.activity.v1'
export const themeKey = 'answerbook.theme.v1'
export const learningKey = 'answerbook.learning.csharp.v1'
const memory = new Map<string, string>()
let writes = Promise.resolve()
let revision=0
const listeners=new Set<()=>void>()
export function subscribeStorage(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener)}}
export const storageRevision=()=>revision
function publish() {revision++;for(const listener of listeners)listener()}

export function readStored(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!
  try { return localStorage.getItem(key) } catch { return null }
}

export async function initializeStorage() {
  if (!Capacitor.isNativePlatform()) return
  for (const key of [sessionKey, customTopicsKey, catalogKey, profileKey, knowledgeKey, activityKey, themeKey, ...learningCatalog.map(course => learningStorageKey(course.id))]) {
    const { value } = await Preferences.get({ key })
    if (value !== null) memory.set(key, value)
    else {
      const previous = readStored(key)
      if (previous !== null) { await Preferences.set({ key, value: previous }); memory.set(key, previous) }
    }
  }
}

export function writeStored(key: string, value: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    try { localStorage.setItem(key, value); publish(); return Promise.resolve() }
    catch (error) { return Promise.reject(error) }
  }
  // Serial writes prevent an older keystroke overwriting a newer answer.
  const next = writes.catch(() => {}).then(async () => {
    await Preferences.set({ key, value })
    memory.set(key, value)
    publish()
  })
  writes = next
  return next
}
