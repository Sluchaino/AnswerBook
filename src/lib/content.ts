import bundled from '../data/questions.json'
import { validateCatalog, downloadCatalog, newerCatalog } from './catalog'
import { catalogKey, readStored, writeStored } from './storage'

export const catalogUrl = import.meta.env.VITE_QUESTIONS_URL || 'https://raw.githubusercontent.com/Sluchaino/AnswerBook/main/src/data/questions.json'
export function readCatalog() {
  try { return newerCatalog(validateCatalog(bundled), validateCatalog(JSON.parse(readStored(catalogKey) ?? 'null'))) }
  catch { return validateCatalog(bundled) }
}

let pending: Promise<ReturnType<typeof validateCatalog>> | undefined
export function refreshCatalog() {
  if (pending) return pending
  pending = downloadCatalog(catalogUrl, async catalog => {
    if (newerCatalog(readCatalog(), catalog) !== catalog) return
    await writeStored(catalogKey, JSON.stringify(catalog))
  }).then(catalog => newerCatalog(readCatalog(), catalog))
    .finally(() => { pending = undefined })
  return pending
}
