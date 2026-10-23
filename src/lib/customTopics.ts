import type { Topic } from './catalog'
import { validateCatalog } from './catalog.ts'

export const isCustomTopic = (topic: Pick<Topic,'id'>) => topic.id.startsWith('custom-')
export function parseCustomTopics(raw: string | null): Topic[] {
  if (raw === null) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length > 100) throw new Error('Неверный список своих тем')
  if (!value.length) return []
  const topics = validateCatalog({topics:value}).topics
  if (topics.some(topic => !isCustomTopic(topic) || topic.questions.some(q => !q.id.startsWith(`${topic.id}-q-`)))) throw new Error('Неверные идентификаторы своих вопросов')
  return topics
}
export function mergeTopics(bundled: Topic[], custom: Topic[]): Topic[] {
  const highest = Math.max(0,...bundled.map(topic=>topic.number))
  const topics = [...bundled,...custom.map((topic,index)=>({...topic,number:highest+index+1}))]
  return validateCatalog({topics}).topics
}
export function makeCustomTopic(title: string, description: string, questions: {id:string;text:string}[], previous?: Topic): Topic {
  const id = previous?.id ?? `custom-${crypto.randomUUID()}`
  if (!title.trim() || title.trim().length > 160) throw new Error('Введите название темы — до 160 символов.')
  if (description.trim().length > 500) throw new Error('Описание должно быть не длиннее 500 символов.')
  if (!questions.length || questions.length > 100 || questions.some(q=>!q.text.trim() || q.text.trim().length > 20000)) throw new Error('Добавьте от 1 до 100 непустых вопросов, до 20 000 символов каждый.')
  const topic: Topic = {id,number:previous?.number ?? 1,title:title.trim(),description:description.trim() || 'Вопросы, которые вы добавили сами',symbol:'✎',color:'blue',questions:questions.map(question=>({
    // Changed wording receives a new ID so saved knowledge and answers do not attach to a different question.
    id:previous?.questions.some(old=>old.id===question.id && old.text===question.text.trim()) ? question.id : `${id}-q-${crypto.randomUUID()}`,
    text:question.text.trim(),
  }))}
  validateCatalog({topics:[topic]})
  return topic
}
