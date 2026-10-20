import { useEffect, useRef, useState } from 'react'
import data from './data/questions.json'
import './App.css'

type Session = { stage: 'topics' | 'questions' | 'result'; selected: string[]; answers: Record<string, string>; index: number; completedAt: string | null }
const topics = data.topics
const storageKey = 'answerbook.session.v1'
const freshSession = (): Session => ({ stage: 'topics', selected: [], answers: {}, index: 0, completedAt: null })
const russianPlural = new Intl.PluralRules('ru')
function countLabel(count: number, one: string, few: string, many: string) {
  const form = russianPlural.select(count)
  return `${count} ${form === 'one' ? one : form === 'few' ? few : many}`
}
function readSession(): Session {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (!raw || typeof raw !== 'object') return freshSession()
    const saved = raw as Partial<Session>
    const selected = Array.isArray(saved.selected) ? topics.filter(t => saved.selected?.includes(t.id)).map(t => t.id) : []
    const answers: Record<string, string> = {}
    for (const topic of topics) for (const q of topic.questions) {
      const answer = saved.answers?.[q.id]
      if (typeof answer === 'string') answers[q.id] = answer
    }
    return { selected, answers, stage: selected.length && (saved.stage === 'questions' || saved.stage === 'result') ? saved.stage : 'topics', index: typeof saved.index === 'number' && Number.isInteger(saved.index) ? Math.max(0, saved.index) : 0, completedAt: typeof saved.completedAt === 'string' && !Number.isNaN(Date.parse(saved.completedAt)) ? saved.completedAt : null }
  } catch { return freshSession() }
}
function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={back ? { transform: 'rotate(180deg)' } : undefined}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}
function App() {
  const [session, setSession] = useState<Session>(readSession)
  const [saveFailed, setSaveFailed] = useState(false)
  const [notice, setNotice] = useState('')
  const [showReset, setShowReset] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const resetDialog = useRef<HTMLDialogElement>(null)
  const chosenTopics = topics.filter(t => session.selected.includes(t.id))
  const questions = chosenTopics.flatMap(topic => topic.questions.map(q => ({ ...q, topic: topic.title })))
  const index = Math.min(session.index, Math.max(0, questions.length - 1))
  const question = questions[index]
  const answered = questions.filter(q => session.answers[q.id]?.trim()).length
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(session)); setSaveFailed(false) }
    catch { setSaveFailed(true) }
  }, [session])
  useEffect(() => { (session.stage === 'questions' ? questionHeading.current : heading.current)?.focus() }, [session.stage, index])
  useEffect(() => { if (showReset) resetDialog.current?.showModal(); else resetDialog.current?.close() }, [showReset])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timer) }, [notice])
  function toggleTopic(id: string) { setSession(s => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter(v => v !== id) : [...s.selected, id], index: 0 })) }
  function finish() { setSession(s => ({ ...s, stage: 'result', completedAt: new Date().toISOString() })) }
  function documentText() {
    const lines = ['Answerbook — мои ответы', session.completedAt ? new Date(session.completedAt).toLocaleString('ru-RU') : '', `Заполнено: ${answered} из ${questions.length}`, '']
    for (const topic of chosenTopics) {
      lines.push(`${topic.number}. ${topic.title}`, '')
      for (const [number, q] of topic.questions.entries()) lines.push(`${number + 1}. ${q.text}`, session.answers[q.id]?.trim() || 'Ответ не указан.', '')
    }
    return lines.join('\n')
  }
  function downloadText() {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + documentText()], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `answerbook-${new Date().toISOString().slice(0, 10)}.txt`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(documentText()); setNotice('Вопросы и ответы скопированы') }
    catch { setNotice('Не удалось скопировать. Скачайте текст или выделите его на странице.') }
  }
  return <div className="app-shell">
    <header className="site-header no-print">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSession(s => ({ ...s, stage: 'topics' })) }} aria-label="Answerbook — выбор тем"><span className="brand-mark" aria-hidden="true">a<span>.</span></span><span>answerbook<span className="brand-dot">.</span></span></a>
      <span className="header-caption">Пространство для ваших знаний</span><span className="local-badge"><i />Без регистрации</span>
    </header>
    <main>
      <nav className="steps no-print" aria-label="Этапы опроса">{['Выбор тем', 'Ваши ответы', 'Результат'].map((title, i) => {
        const current = ['topics', 'questions', 'result'].indexOf(session.stage)
        return <div key={title} className={`step ${current === i ? 'active' : ''} ${current > i ? 'done' : ''}`} aria-current={current === i ? 'step' : undefined}><span>{current > i ? '✓' : `0${i + 1}`}</span>{title}</div>
      })}</nav>
      {session.stage === 'topics' && <>
        <section className="intro"><div className="eyebrow"><span />ЗНАНИЯ НАЧИНАЮТСЯ С ВОПРОСА</div><h1 ref={heading} tabIndex={-1}>О чём поговорим<span className="serif"> сегодня?</span></h1><p>Выберите темы, ответьте своими словами и соберите<br className="desktop-break" /> личный конспект. Только вы и ваши знания.</p></section>
        <div className="workspace">
          <section className="topics-section" aria-labelledby="topics-title"><div className="section-heading"><h2 id="topics-title">Выберите темы</h2><button className="text-button" onClick={() => setSession(s => ({ ...s, selected: s.selected.length === topics.length ? [] : topics.map(t => t.id), index: 0 }))}>{session.selected.length === topics.length ? 'Снять выбор' : 'Выбрать все'}</button></div>
            <div className="topic-grid">{topics.map(topic => {
                const selected = session.selected.includes(topic.id)
                return <button key={topic.id} className={`topic-card ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => toggleTopic(topic.id)}>
                  <span className="card-top"><span className={`topic-symbol ${topic.color}`}>{topic.symbol}</span><span className="check-box" aria-hidden="true">{selected ? '✓' : ''}</span></span>
                  <strong>{topic.number}. {topic.title}</strong><span className="topic-description">{topic.description}</span><span className="question-count">{countLabel(topic.questions.length, 'вопрос', 'вопроса', 'вопросов')} <span aria-hidden="true">↗</span></span>
                </button>
            })}</div>
          </section>
          <aside className="session-card"><span className="eyebrow">ВАША СЕССИЯ</span><h2>Небольшой шаг.<br />Большая ясность.</h2><p>Не нужно искать идеальную формулировку. Запишите, как понимаете вы.</p><div className="session-stats"><div><span>Выбрано тем</span><strong>{chosenTopics.length.toString().padStart(2, '0')}</strong></div><div><span>Вопросов</span><strong>{questions.length.toString().padStart(2, '0')}</strong></div></div><button className="primary" disabled={!questions.length} onClick={() => setSession(s => ({ ...s, stage: 'questions', completedAt: null }))}>{answered ? 'Продолжить опрос' : 'Начать опрос'}<Arrow /></button><span className="session-note">В своём темпе. Без таймера.</span><div className="aside-foot"><span aria-hidden="true">↳</span><span>В конце — ваши вопросы и ответы<br />в одном документе.</span></div></aside>
        </div>
        <div className="bottom-note"><span aria-hidden="true">✳</span><p>Здесь нет вариантов ответа и оценок.<br /><strong>Есть место, чтобы подумать самостоятельно.</strong></p></div>
      </>}
      {session.stage === 'questions' && question && <>
        <section className="page-intro"><span className="eyebrow">ВРЕМЯ ПОДУМАТЬ</span><h1 ref={heading} tabIndex={-1}>Сформулируйте <span className="serif">свою мысль.</span></h1><p>Можно пропустить вопрос и вернуться к нему позже.</p></section>
        <div className="answer-workspace"><section className="answer-card"><div className="answer-top"><span className="topic-pill">{question.topic}</span><span>Вопрос {index + 1} из {questions.length}</span></div><h2 ref={questionHeading} tabIndex={-1} id="question-label">{question.text}</h2><label className="answer-label" htmlFor="answer">Ваш ответ</label><textarea id="answer" aria-labelledby="question-label" placeholder="Начните писать здесь…" value={session.answers[question.id] ?? ''} onChange={e => setSession(s => ({ ...s, answers: { ...s.answers, [question.id]: e.target.value } }))} /><div className="answer-meta"><span>{saveFailed ? 'Не удалось сохранить в браузере' : 'Ответ сохраняется в этом браузере'}</span><span>{(session.answers[question.id] ?? '').length} символов</span></div><div className="answer-actions"><button className="secondary" disabled={index === 0} onClick={() => setSession(s => ({ ...s, index: index - 1 }))}><Arrow back />Назад</button>{index < questions.length - 1 ? <button className="primary" onClick={() => setSession(s => ({ ...s, index: index + 1 }))}>Следующий вопрос<Arrow /></button> : <button className="primary" onClick={finish}>Посмотреть результат<Arrow /></button>}</div></section>
          <aside className="progress-card"><span className="eyebrow">ВАШ ПРОГРЕСС</span><div className="progress-number">{answered}<span> / {questions.length}</span></div><p>вопросов с ответом</p><progress value={answered} max={questions.length} aria-label="Заполнено вопросов" /><div className="question-nav" aria-label="Переход к вопросу">{questions.map((q, i) => <button key={q.id} aria-label={`Вопрос ${i + 1}${session.answers[q.id]?.trim() ? ', есть ответ' : ', без ответа'}`} aria-current={i === index ? 'step' : undefined} className={`${session.answers[q.id]?.trim() ? 'filled' : ''} ${i === index ? 'current' : ''}`} onClick={() => setSession(s => ({ ...s, index: i }))}>{i + 1}</button>)}</div><button className="text-button" onClick={() => setSession(s => ({ ...s, stage: 'topics' }))}>Изменить темы</button><button className="secondary finish-button" onClick={finish}>Завершить опрос</button><p className="small-note">Незаполненные ответы будут отмечены в документе.</p></aside></div>
      </>}
      {session.stage === 'result' && <>
        <section className="page-intro no-print"><span className="eyebrow">МЫСЛИ ОБРЕЛИ ФОРМУ</span><h1 ref={heading} tabIndex={-1}>Ваш личный <span className="serif">конспект.</span></h1><p>Сохраните ответы и возвращайтесь к ним, чтобы увидеть свой рост.</p></section>
        <div className="result-toolbar no-print"><div><strong>{answered} из {questions.length}</strong><span> вопросов заполнено · {questions.length ? Math.round(answered / questions.length * 100) : 0}%</span></div><div className="export-actions"><button className="secondary" onClick={copyText}>Копировать</button><button className="secondary" onClick={downloadText}>Скачать .txt</button><button className="primary" onClick={() => window.print()}>Сохранить PDF <span aria-hidden="true">↓</span></button></div></div><p className="pdf-help no-print">Для PDF в окне печати выберите «Сохранить как PDF».</p>
        <article className="document"><header className="document-header"><span className="eyebrow">ANSWERBOOK / ЛИЧНЫЙ КОНСПЕКТ</span><h2>Вопросы и мои ответы</h2><p>{session.completedAt && new Date(session.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {countLabel(chosenTopics.length, 'тема', 'темы', 'тем')} · {countLabel(questions.length, 'вопрос', 'вопроса', 'вопросов')}</p></header>{chosenTopics.map(topic => (
          <section className="document-topic" key={topic.id}>
            <h3 className="document-topic-title">{topic.number}. {topic.title}</h3>
            {topic.questions.map((q, number) => <div className="document-answer" key={q.id}>
              <h4>{number + 1}. {q.text}</h4>
              <p className={!session.answers[q.id]?.trim() ? 'unanswered' : ''}>{session.answers[q.id]?.trim() || 'Ответ не указан.'}</p>
            </div>)}
          </section>
        ))}</article>
        <div className="result-bottom no-print"><button className="secondary" onClick={() => setSession(s => ({ ...s, stage: 'questions' }))}><Arrow back />Редактировать ответы</button><button className="text-button" onClick={() => setShowReset(true)}>Начать новый опрос</button></div>
      </>}
    </main>
    <footer className="site-footer no-print"><span>answerbook · Учиться, размышлять, формулировать.</span><span className={saveFailed ? 'save-error' : ''}>{saveFailed ? 'Хранилище недоступно. Скачайте ответы перед закрытием.' : 'Ваши ответы остаются в этом браузере'}</span></footer>
    {notice && <div className="toast no-print" role="status">{notice}</div>}
    <dialog ref={resetDialog} onCancel={() => setShowReset(false)} className="reset-dialog"><h2>Начать с чистого листа?</h2><p>Текущие ответы будут удалены из браузера. Сначала сохраните конспект, если хотите оставить его.</p><div className="answer-actions"><button className="secondary" onClick={() => setShowReset(false)}>Отмена</button><button className="primary" onClick={() => { setSession(freshSession()); setShowReset(false) }}>Начать заново</button></div></dialog>
  </div>
}
export default App
