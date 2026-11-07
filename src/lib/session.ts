import type { Topic } from './catalog'
import { sessionTopics } from './catalog.ts'
import { shuffled } from './shuffle.ts'
import { questionRedirects } from './questionRedirects.ts'
import {mergedTopicIds,mergeTopicSettings} from './topicMerges.ts'

export type Session = { stage: 'topics' | 'questions' | 'result'; selected: string[]; answers: Record<string, string>; index: number; completedAt: string | null; topicSnapshot?: Topic[]; questionIds?: string[]; lastQuestionIds?:string[] }
export const freshSession = (): Session => ({ stage: 'topics', selected: [], answers: {}, index: 0, completedAt: null })

export function restoreSession(raw: string | null, available: Topic[]): Session {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object') return freshSession()
    const saved = value as Partial<Session>
    const snapshot = sessionTopics(saved.topicSnapshot, available)
    // Only a running survey uses its frozen catalogue to restore the selection.
    // The catalogue screen can select topics introduced after that snapshot.
    const choices = saved.stage === 'questions' || saved.stage === 'result' ? snapshot : available
    const selectedIds=Array.isArray(saved.selected) ? (saved.stage==='questions'||saved.stage==='result' ? saved.selected : mergedTopicIds(saved.selected)) : []
    const selected = choices.filter(t => selectedIds.includes(t.id)).map(t => t.id)
    const answers: Record<string, string> = {}
    if (saved.answers && typeof saved.answers === 'object') for (const [id, answer] of Object.entries(saved.answers)) {
      if (typeof answer === 'string') answers[id] = answer
    }
    const restored: Session = { selected, answers, topicSnapshot: snapshot, questionIds: Array.isArray(saved.questionIds) ? saved.questionIds.filter((id): id is string => typeof id === 'string') : undefined, stage: selected.length && (saved.stage === 'questions' || saved.stage === 'result') ? saved.stage : 'topics', index: typeof saved.index === 'number' && Number.isInteger(saved.index) ? Math.max(0, saved.index) : 0, completedAt: typeof saved.completedAt === 'string' && !Number.isNaN(Date.parse(saved.completedAt)) ? saved.completedAt : null }
    if(Array.isArray(saved.lastQuestionIds))restored.lastQuestionIds=saved.lastQuestionIds.filter(id=>typeof id==='string')
    return restored.stage === 'topics' && restored.completedAt ? leaveSession(restored) : restored
  } catch { return freshSession() }
}

export function leaveSession(session: Session): Session {
  if (session.completedAt || session.stage === 'result') return { ...freshSession(), selected: mergedTopicIds(session.selected), lastQuestionIds:session.questionIds }
  return { ...session, selected:mergedTopicIds(session.selected), stage: 'topics' }
}

export function testTopics(topics: Topic[], selected: string[], ids: string[]) {
  const order = new Map(ids.map((id,i)=>[id,i]))
  return topics.filter(topic => selected.includes(topic.id)).map(topic => ({ ...topic, questions: topic.questions.filter(q => order.has(q.id)).sort((a,b)=>order.get(a.id)!-order.get(b.id)!) })).filter(topic => topic.questions.length)
}

export function eligibleIds(topics: Topic[], selected: string[], known: string[], includeKnown: boolean, includeKnownByTopic: Record<string, boolean> = {}): string[] {
  const excluded = new Set(known.map(id=>questionRedirects[id] ?? id))
  return topics.filter(topic => selected.includes(topic.id)).flatMap(topic => {
    const include = Object.hasOwn(includeKnownByTopic, topic.id) ? includeKnownByTopic[topic.id] : includeKnown
    return topic.questions.filter(q => include || !excluded.has(q.id)).map(q => q.id)
  })
}

export function beginSession(session: Session, topics: Topic[], selected: string[], ids: string[],random:()=>number=Math.random): Session {
  const allowed=new Set(ids)
  const resume = !session.completedAt && session.questionIds?.length === ids.length && session.questionIds.every(id=>allowed.has(id))
  const previous=session.lastQuestionIds ?? session.questionIds
  const order=resume ? session.questionIds! : topics.filter(t=>selected.includes(t.id)).flatMap(t=>{const group=t.questions.filter(q=>allowed.has(q.id)).map(q=>q.id);return shuffled(group,random,previous?.filter(id=>group.includes(id)))})
  return { ...freshSession(), ...(resume ? { answers: session.answers, index: session.index } : {}), stage: 'questions', selected, topicSnapshot: resume ? session.topicSnapshot ?? topics : topics, questionIds: order }
}

export type Knowledge = { knownIds: string[]; includeKnown: boolean; includeKnownByTopic?: Record<string, boolean> }
export function topicIncludesKnown(knowledge: Knowledge, topicId: string) {
  return knowledge.includeKnownByTopic && Object.hasOwn(knowledge.includeKnownByTopic, topicId) ? knowledge.includeKnownByTopic[topicId] : knowledge.includeKnown
}
export function parseKnowledge(raw: string | null): Knowledge {
  if (raw === null) return { knownIds: [], includeKnown: false }
  const value = JSON.parse(raw) as Knowledge
  if (!value || !Array.isArray(value.knownIds) || value.knownIds.some(id => typeof id !== 'string' || !id) || typeof value.includeKnown !== 'boolean') throw new Error('Неверные отметки знаний')
  if (value.includeKnownByTopic !== undefined && (!value.includeKnownByTopic || typeof value.includeKnownByTopic !== 'object' || Array.isArray(value.includeKnownByTopic) || Object.values(value.includeKnownByTopic).some(flag => typeof flag !== 'boolean'))) throw new Error('Неверные настройки тем')
  return { knownIds: [...new Set(value.knownIds.map(id=>questionRedirects[id] ?? id))], includeKnown: value.includeKnown, ...(value.includeKnownByTopic !== undefined ? { includeKnownByTopic: mergeTopicSettings(value.includeKnownByTopic) } : {}) }
}
