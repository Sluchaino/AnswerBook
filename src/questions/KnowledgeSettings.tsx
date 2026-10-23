import { useEffect, useRef, useState } from 'react'
import type { Topic } from '../lib/catalog'
import { topicIncludesKnown } from '../lib/session'
import type { Knowledge } from '../lib/session'
import './questions.css'

type Props = { topic: Topic | null; knowledge: Knowledge; onChange: (value: Knowledge) => void; onClose: () => void; disabled: boolean; saveFailed: boolean }

export function KnowledgeSettings({ topic, knowledge, onChange, onClose, disabled, saveFailed }: Props) {
  const [search, setSearch] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const total = topic?.questions ?? []
  const knownCount = total.filter(q => knowledge.knownIds.includes(q.id)).length
  const includeKnown = topic ? topicIncludesKnown(knowledge, topic.id) : false
  const questionCount = includeKnown ? total.length : total.length - knownCount
  const query = search.trim().toLocaleLowerCase('ru')
  const visible = total.filter(q => !query || q.text.toLocaleLowerCase('ru').includes(query) || q.block?.toLocaleLowerCase('ru').includes(query))
  useEffect(() => {
    if (topic) { setSearch(''); dialog.current?.showModal() }
    else dialog.current?.close()
  }, [topic?.id])
  function toggle(id: string) {
    onChange({ ...knowledge, knownIds: knowledge.knownIds.includes(id) ? knowledge.knownIds.filter(value => value !== id) : [...knowledge.knownIds, id] })
  }
  return <dialog className="knowledge-dialog" ref={dialog} aria-labelledby="knowledge-title" onCancel={onClose} onClose={onClose}>
    <div className="knowledge-dialog-heading"><h2 id="knowledge-title">Настройки темы</h2><button className="icon-button" aria-label="Закрыть настройки темы" onClick={onClose}>×</button></div>
    <p className="knowledge-topic-title">{topic?.title}</p><p className="content-provenance">{topic?.id.startsWith('custom-') ? 'Своя тема · вопросы добавлены вами' : 'Вопросы созданы с помощью ИИ'}</p>
    <label className="include-known"><input type="checkbox" checked={includeKnown} disabled={disabled} onChange={event => { if (topic) onChange({ ...knowledge, includeKnownByTopic: { ...knowledge.includeKnownByTopic, [topic.id]: event.target.checked } }) }} /><span>Включить вопросы, которые вы уже знаете<small>Настройка действует только для этой темы.</small></span></label>
    <p className="knowledge-hint">В тесте: {questionCount} из {total.length}. Отметьте знакомые вопросы галочкой. Изменения сохраняются автоматически.</p>
    {total.length > 0 && questionCount === 0 && <p className="knowledge-empty" role="status">Все вопросы знакомы. Включите их в тест или снимите часть отметок.</p>}
    {(disabled || saveFailed) && <p className="knowledge-error" role="alert">{disabled ? 'Не удалось прочитать отметки. Перезапустите приложение; старые данные сохранены.' : 'Не удалось сохранить настройки на устройстве.'}{saveFailed && <button className="text-button" onClick={() => onChange({ ...knowledge })}>Повторить сохранение</button>}</p>}
    <input className="knowledge-search" type="search" aria-label="Поиск по вопросам темы" placeholder="Найти вопрос…" value={search} onChange={event => setSearch(event.target.value)} />
    <div className="knowledge-list">{visible.map(q => <label className="knowledge-question" key={q.id}><input type="checkbox" checked={knowledge.knownIds.includes(q.id)} disabled={disabled} onChange={() => toggle(q.id)} /><span>{q.block && <em>{q.block}</em>}{q.text}<small>{knowledge.knownIds.includes(q.id) ? 'Знаю' : 'Хочу повторить'}</small></span></label>)}{!visible.length && <p className="knowledge-hint">По вашему запросу вопросов не найдено.</p>}</div>
    <div className="knowledge-dialog-footer"><span>Знакомых: {knownCount} из {total.length}</span><button className="primary" onClick={onClose}>Готово</button></div>
  </dialog>
}
