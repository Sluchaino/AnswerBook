export type Question = { id: string; text: string; block?: string; source?: string }
export type Topic = { id: string; number: number; title: string; symbol: string; color: string; description: string; questions: Question[] }
export type Catalog = { topics: Topic[]; revision?: number }
const colors = new Set(['violet', 'blue', 'orange', 'green', 'pink', 'teal'])

export function validateCatalog(input: unknown): Catalog {
  if (!input || typeof input !== 'object') throw new Error('Неверный формат списка вопросов')
  const topics = (input as Catalog).topics
  const revision = (input as Catalog).revision
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 0)) throw new Error('Неверная версия каталога')
  if (!Array.isArray(topics) || !topics.length || topics.length > 200) throw new Error('Неверный список тем')
  const topicIds = new Set<string>()
  const questionIds = new Set<string>()
  for (const topic of topics) {
    if (!topic || typeof topic !== 'object') throw new Error('Неверная тема')
    for (const field of ['id', 'title', 'symbol', 'color', 'description'] as const) {
      if (typeof topic[field] !== 'string' || !topic[field].trim() || topic[field].length > 1000) throw new Error(`Неверное поле ${field}`)
    }
    if (!Number.isInteger(topic.number) || topic.number < 1 || !colors.has(topic.color) || topicIds.has(topic.id)) throw new Error('Неверная тема или повтор ID')
    topicIds.add(topic.id)
    if (!Array.isArray(topic.questions) || !topic.questions.length) throw new Error('Тема без вопросов')
    for (const question of topic.questions) {
      if (question?.block !== undefined && (typeof question.block !== 'string' || !question.block.trim())) throw new Error('Неверный блок вопроса')
      if (!question || typeof question.id !== 'string' || !question.id.trim() || typeof question.text !== 'string' || !question.text.trim() || question.text.length > 20000 || questionIds.has(question.id)) throw new Error('Неверный вопрос или повтор ID')
      questionIds.add(question.id)
      if (questionIds.size > 10000) throw new Error('Слишком много вопросов')
    }
  }
  return { topics, ...(revision !== undefined ? { revision } : {}) }
}

export function newerCatalog(current: Catalog, incoming: Catalog): Catalog {
  return (incoming.revision ?? 0) >= (current.revision ?? 0) ? incoming : current
}

// A running session owns a snapshot; downloads only affect future sessions.
export function sessionTopics(snapshot: Topic[] | undefined, available: Topic[]): Topic[] {
  if (!snapshot) return available
  try { return validateCatalog({ topics: snapshot }).topics } catch { return available }
}

export async function downloadCatalog(url: string, persist: (catalog: Catalog) => Promise<void>, fetcher: typeof fetch = fetch): Promise<Catalog> {
  const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('Не удалось загрузить вопросы')
  const text = await response.text()
  if (text.length > 2_000_000) throw new Error('Список вопросов слишком большой')
  const catalog = validateCatalog(JSON.parse(text))
  await persist(catalog)
  return catalog
}
