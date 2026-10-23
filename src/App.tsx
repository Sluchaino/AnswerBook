import {DirectionGroup} from './components/DirectionGroup'
import {useTheme} from './lib/useTheme'
import {ThemeToggle} from './components/ThemeToggle'
import { CustomTopicEditor } from './questions/CustomTopicEditor'
import { isCustomTopic, parseCustomTopics, mergeTopics } from './lib/customTopics'
import { customTopicsKey } from './lib/storage'
import type { Topic } from './lib/catalog'
import { Select } from './components/Select'
import { groupTopics,filterTopics, topicDirections } from './lib/topicFilters'
import { learningDirections } from './lib/learningContent'
import { useStudyActivity } from './lib/useStudyActivity'
import { Arrow } from './components/Arrow'
import { useEffect, useRef, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { readCatalog, refreshCatalog } from './lib/content'
import { sessionTopics } from './lib/catalog'
import { readStored, writeStored, sessionKey, profileKey, knowledgeKey } from './lib/storage'
import { freshSession, restoreSession, leaveSession, beginSession, eligibleIds, testTopics, parseKnowledge } from './lib/session'
import type { Session } from './lib/session'
import { KnowledgeSettings } from './questions/KnowledgeSettings'
import { LearningPage } from './learning/LearningPage'
import { emptyProfile, parseProfile } from './lib/profile'
import { ProfilePage } from './profile/ProfilePage'
import { isAndroid, shareText, printDocument } from './lib/mobile'
import { useMobileLayout } from './lib/useMobileLayout'
import './App.css'
import { MobileLayoutStyles } from './mobile/MobileLayoutStyles'
import { MobileNavigation } from './mobile/MobileNavigation'
import type { AppView } from './mobile/MobileNavigation'

const russianPlural = new Intl.PluralRules('ru')
function countLabel(count: number, one: string, few: string, many: string) {
  const form = russianPlural.select(count)
  return `${count} ${form === 'one' ? one : form === 'few' ? few : many}`
}
function readSession(): Session {
  let custom: Topic[] = []
  try {custom = parseCustomTopics(readStored(customTopicsKey))} catch { /* Keep damaged custom data for recovery. */ }
  return restoreSession(readStored(sessionKey), mergeTopics(readCatalog().topics,custom))
}
function App() {
  const {theme,toggleTheme,themeError}=useTheme()
  const {activity,recordStudy,activityError,purchaseCourse,purchaseFreeze,retrySave,busy}=useStudyActivity()
  const mobileLayout = useMobileLayout()
  const [view, setView] = useState<AppView>('catalog')
  const [topicQuery, setTopicQuery] = useState('')
  const [topicDirection, setTopicDirection] = useState('all')
  const [learningStart, setLearningStart] = useState<{ id:string | null; key:number }>({ id:null, key:0 })
  const [settingsTopicId, setSettingsTopicId] = useState<string | null>(null)
  const [profileLoad] = useState(() => {
    try { return { profile: parseProfile(readStored(profileKey)), failed: false } }
    catch { return { profile: emptyProfile(), failed: true } }
  })
  const [profile, setProfile] = useState(profileLoad.profile)
  const [profileSave, setProfileSave] = useState<'saved' | 'saving' | 'error'>('saved')
  const [nativeVersion, setNativeVersion] = useState('')
  const [session, setSession] = useState<Session>(readSession)
  const [knowledgeLoad] = useState(() => {
    try { return { value: parseKnowledge(readStored(knowledgeKey)), failed: false } }
    catch { return { value: parseKnowledge(null), failed: true } }
  })
  const [knowledge, setKnowledge] = useState(knowledgeLoad.value)
  const [knowledgeSaveFailed, setKnowledgeSaveFailed] = useState(false)
  const [baseTopics, setBaseTopics] = useState(() => readCatalog().topics)
  const [customLoad] = useState(() => {
    try { return {topics:parseCustomTopics(readStored(customTopicsKey)),failed:false} }
    catch { return {topics:[] as Topic[],failed:true} }
  })
  const [customTopics,setCustomTopics] = useState(customLoad.topics)
  const [topicEditor,setTopicEditor] = useState<Topic | 'new' | null>(null)
  const availableTopics = mergeTopics(baseTopics,customTopics)
  const [syncStatus, setSyncStatus] = useState('Вопросы доступны офлайн')
  const topics = session.stage === 'topics' ? availableTopics : sessionTopics(session.topicSnapshot, availableTopics)
  const visibleTopics = filterTopics(topics, topicQuery, topicDirection)
  const filtersActive = Boolean(topicQuery.trim()) || topicDirection !== 'all'
  const visibleSelected = visibleTopics.filter(topic => session.selected.includes(topic.id)).length
  const [saveFailed, setSaveFailed] = useState(false)
  const [notice, setNotice] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [expandedTopics, setExpandedTopics] = useState<string[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  const mobileHeading = useRef<HTMLHeadingElement>(null)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const resetDialog = useRef<HTMLDialogElement>(null)
  const questionsDialog = useRef<HTMLDialogElement>(null)
  const exportDialog = useRef<HTMLDialogElement>(null)
  const chosenTopics = topics.filter(t => session.selected.includes(t.id))
  const activeIds = session.stage === 'topics' ? eligibleIds(topics, session.selected, knowledge.knownIds, knowledge.includeKnown, knowledge.includeKnownByTopic) : session.questionIds ?? eligibleIds(topics, session.selected, [], true)
  const activeTopics = testTopics(topics, session.selected, activeIds)
  const questions = activeTopics.flatMap(topic => topic.questions.map(q => ({ ...q, topic: topic.title })))
  const index = Math.min(session.index, Math.max(0, questions.length - 1))
  const question = questions[index]
  const answered = questions.filter(q => session.answers[q.id]?.trim()).length
  useEffect(() => {
    if (knowledgeLoad.failed) return
    let active = true
    void writeStored(knowledgeKey, JSON.stringify(knowledge)).then(() => { if (active) setKnowledgeSaveFailed(false) }, () => { if (active) setKnowledgeSaveFailed(true) })
    return () => { active = false }
  }, [knowledge, knowledgeLoad.failed])
  useEffect(() => {
    if (profileLoad.failed) return
    let active = true
    setProfileSave('saving')
    void writeStored(profileKey, JSON.stringify(profile)).then(() => { if (active) setProfileSave('saved') }, () => { if (active) setProfileSave('error') })
    return () => { active = false }
  }, [profile, profileLoad.failed])
  useEffect(() => {
    if (isAndroid) void NativeApp.getInfo().then(info => setNativeVersion(info.version)).catch(() => {})
  }, [])
  useEffect(() => {
    let active = true
    void writeStored(sessionKey, JSON.stringify(session)).then(() => { if (active) setSaveFailed(false) }, () => { if (active) setSaveFailed(true) })
    return () => { active = false }
  }, [session])
  useEffect(() => {
    let active = true
    const sync = async () => {
      if (!active) return
      setSyncStatus('Проверяем обновления вопросов…')
      try {
        const catalog = await refreshCatalog()
        if (active) { setBaseTopics(catalog.topics); setSyncStatus('Вопросы обновлены и доступны офлайн') }
      } catch { if (active) setSyncStatus('Нет связи с обновлениями · можно проходить офлайн') }
    }
    const onResume = () => { if (document.visibilityState === 'visible') void sync() }
    void sync()
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', onResume)
    const listener = isAndroid ? NativeApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void sync() }) : null
    return () => {
      active = false
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onResume)
      if (listener) void listener.then(handle => handle.remove())
    }
  }, [])
  useEffect(() => {
    if (!isAndroid) return
    const listener = NativeApp.addListener('backButton', () => {
      if (showQuestions) setShowQuestions(false)
      else if (showExport) setShowExport(false)
      else if (showReset) setShowReset(false)
      else if (document.querySelector<HTMLDialogElement>('.custom-topic-editor[open]')) document.querySelector<HTMLDialogElement>('.custom-topic-editor[open]')?.close()
      else if (document.querySelector<HTMLDialogElement>('.profile-info-dialog[open]')) document.querySelector<HTMLDialogElement>('.profile-info-dialog[open]')?.close()
      else if (view === 'profile') {
        const editor = document.querySelector<HTMLDialogElement>('.profession-editor[open]')
        if (editor) editor.close()
        else setView('catalog')
      }
      else if (view === 'learning') setView('catalog')
      else if (document.querySelector<HTMLDialogElement>('.knowledge-dialog[open]')) document.querySelector<HTMLDialogElement>('.knowledge-dialog[open]')?.close()
      else if (session.stage === 'result') goHome()
      else if (session.stage === 'questions' && index > 0) setSession(s => ({ ...s, index: index - 1 }))
      else if (session.stage === 'questions') setSession(s => ({ ...s, stage: 'topics' }))
      else void NativeApp.minimizeApp()
    })
    return () => { void listener.then(handle => handle.remove()) }
  }, [session.stage, index, showReset, showQuestions, showExport, view])
  useEffect(() => {
    const target = session.stage === 'questions' ? questionHeading.current : mobileLayout && session.stage === 'result' ? mobileHeading.current : heading.current
    target?.focus()
  }, [session.stage, index, mobileLayout])
  useEffect(() => { if (mobileLayout) window.scrollTo({ top: 0, behavior: 'auto' }) }, [session.stage, index, mobileLayout, view])
  useEffect(() => { if (showReset) resetDialog.current?.showModal(); else resetDialog.current?.close() }, [showReset])
  useEffect(() => { if (showQuestions) questionsDialog.current?.showModal(); else questionsDialog.current?.close() }, [showQuestions])
  useEffect(() => { if (showExport) exportDialog.current?.showModal(); else exportDialog.current?.close() }, [showExport])
  useEffect(() => {
    if (!mobileLayout) { setShowQuestions(false); setShowExport(false) }
  }, [mobileLayout])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timer) }, [notice])
  const shownCoinTransaction=useRef(activity.economy?.history[0]?.id)
  useEffect(()=>{
    const transaction=activity.economy?.history[0]
    if(transaction && transaction.id!==shownCoinTransaction.current && transaction.amount>0)setNotice(`+${transaction.amount} монет · ${transaction.label}`)
    shownCoinTransaction.current=transaction?.id
  },[activity.economy])
  function toggleTopic(id: string) { setSession(s => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter(v => v !== id) : [...s.selected, id], index: 0 })) }
  function finish() {
    questionsDialog.current?.close()
    setShowQuestions(false)
    setSession(s => ({ ...s, stage: 'result', completedAt: new Date().toISOString() }))
  }
  function goHome() { setView('catalog'); setSession(leaveSession); setExpandedTopics([]); setNotice('') }
  function navigate(next: AppView) {
    if (next === 'learning') setLearningStart(current => ({ id:null, key:current.key + 1 }))
    setSettingsTopicId(null)
    if (next === 'catalog') goHome()
    else { setSession(leaveSession); setView(next) }
  }
  function startSession() {
    if (!activeIds.length) return
    setSession(s => beginSession(s, availableTopics, s.selected, activeIds))
  }
  function previousQuestion() {
    if (index > 0) setSession(s => ({ ...s, index: index - 1 }))
    else goHome()
  }
  function selectQuestion(next: number) {
    questionsDialog.current?.close()
    setShowQuestions(false)
    setSession(s => ({ ...s, index: next }))
  }
  function closeExport() { exportDialog.current?.close(); setShowExport(false) }
  function documentText() {
    const lines = ['Answerbook — мои ответы', session.completedAt ? new Date(session.completedAt).toLocaleString('ru-RU') : '', `Заполнено: ${answered} из ${questions.length}`, '']
    for (const topic of activeTopics) {
      lines.push(`${topic.number}. ${topic.title}`, '')
      for (const [number, q] of topic.questions.entries()) lines.push(`${number + 1}. ${q.text}`, session.answers[q.id]?.trim() || 'Ответ не указан.', '')
    }
    return lines.join('\n')
  }
  async function downloadText() {
    if (isAndroid) {
      try { await shareText(documentText()) }
      catch { setNotice('Не удалось открыть отправку файла. Попробуйте ещё раз.') }
      return
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + documentText()], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `answerbook-${new Date().toISOString().slice(0, 10)}.txt`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(documentText()); setNotice('Вопросы и ответы скопированы') }
    catch { setNotice('Не удалось скопировать. Скачайте текст или выделите его на странице.') }
  }
  async function savePdf() {
    try { await printDocument() }
    catch { setNotice('Не удалось открыть печать. Можно сохранить конспект как текст.') }
  }
  return <div data-layout={mobileLayout ? 'mobile' : 'desktop'} className={`app-shell screen-${view !== 'catalog' ? view : session.stage}`}>
    <MobileLayoutStyles enabled={mobileLayout} />
    <header className="mobile-appbar mobile-only no-print">
      {view !== 'catalog' || session.stage === 'topics' ? <a className="brand mobile-brand" href="#" onClick={e => { e.preventDefault(); goHome() }} aria-label="AnswerBook — главная"><span className="brand-mark" aria-hidden="true">a<span>.</span></span><span>answerbook<span className="brand-dot">.</span></span></a> : <>
        {session.stage === 'questions' && <button className="icon-button" onClick={goHome} aria-label="На главную"><Arrow back /></button>}
        <div className="appbar-title"><h1 ref={mobileHeading} tabIndex={-1}>{session.stage === 'questions' ? 'Опрос' : 'Результаты'}</h1><span>{session.stage === 'questions' ? `Вопрос ${index + 1} из ${questions.length}` : 'Ваш личный конспект'}</span></div>
      </>}
      {view !== 'catalog' || session.stage === 'topics' ? <span className="mobile-offline"><i /><span>Офлайн-доступ{nativeVersion && <small>Версия {nativeVersion} · Android</small>}</span></span> : session.stage === 'questions' ? <button className="appbar-action" onClick={finish}>Завершить</button> : null}
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
    </header>
    <header className="site-header no-print">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); goHome() }} aria-label="Answerbook — выбор тем"><span className="brand-mark" aria-hidden="true">a<span>.</span></span><span>answerbook<span className="brand-dot">.</span></span></a>
      <span className="header-caption">Пространство для ваших знаний</span><span className="local-badge"><i />Без регистрации</span>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
    </header>
    {(view !== 'catalog' || session.stage === 'topics') && <nav className="app-navigation no-print" aria-label="Разделы приложения"><button aria-current={view === 'catalog' ? 'page' : undefined} onClick={() => navigate('catalog')}>Каталог</button><button aria-current={view === 'learning' ? 'page' : undefined} onClick={() => navigate('learning')}>Курсы</button><button aria-current={view === 'profile' ? 'page' : undefined} onClick={() => navigate('profile')}>Личный кабинет</button></nav>}
    {view === 'catalog' && session.stage === 'questions' && <div className="mobile-actionbar mobile-only no-print" aria-label="Управление опросом">
      <button className="secondary mobile-previous" onClick={previousQuestion} aria-label={index === 0 ? 'К выбору тем' : 'Предыдущий вопрос'}><Arrow back /></button><button className="primary" onClick={() => index < questions.length - 1 ? setSession(s => ({ ...s, index: index + 1 })) : finish()}>{index < questions.length - 1 ? 'Следующий вопрос' : 'К результатам'}<Arrow /></button>
    </div>}
    {themeError && <p className="theme-error" role="alert">{themeError}</p>}
    <main>
      {view === 'profile' ? <ProfilePage retrySave={retrySave} purchaseFreeze={purchaseFreeze} busy={busy} activity={activity} activityError={activityError} profile={profile} topics={availableTopics} onChange={setProfile} saveState={profileSave} loadFailed={profileLoad.failed} onOpenCourse={topicId => {
        setSession(s => ({ ...leaveSession(s), selected: [topicId], stage: 'topics' }))
        setView('catalog')
      }} onOpenLearning={courseId => { setLearningStart(current => ({ id:courseId, key:current.key + 1 })); setView('learning') }} /> : view === 'learning' ? <LearningPage retrySave={retrySave} purchaseCourse={purchaseCourse} purchaseFreeze={purchaseFreeze} busy={busy} activity={activity} activityError={activityError} onStudy={recordStudy} key={learningStart.key} initialCourseId={learningStart.id} /> : <>
      <nav className="steps no-print" aria-label="Этапы опроса">{['Выбор тем', 'Ваши ответы', 'Результат'].map((title, i) => {
        const current = ['topics', 'questions', 'result'].indexOf(session.stage)
        return <div key={title} className={`step ${current === i ? 'active' : ''} ${current > i ? 'done' : ''}`} aria-current={current === i ? 'step' : undefined}><span>{current > i ? '✓' : `0${i + 1}`}</span>{title}</div>
      })}</nav>
      <p className="sync-status no-print" role="status">{syncStatus}</p>
      {saveFailed && <p className="mobile-save-warning mobile-only no-print" role="alert">Не удалось сохранить ответы на устройстве. Сохраните конспект перед выходом.</p>}
      {session.stage === 'topics' && <>
        {customLoad.failed && <p className="knowledge-error" role="alert">Не удалось прочитать свои темы. Перезапустите приложение. Сохранённые данные не перезаписаны.</p>}
        <section className="mobile-test-summary mobile-only" aria-label="Выбранный тест"><div><strong>{countLabel(chosenTopics.length, 'тема', 'темы', 'тем')}</strong><small>{countLabel(questions.length, 'вопрос', 'вопроса', 'вопросов')}</small></div><button className="primary" disabled={!questions.length} onClick={startSession}>{answered ? 'Продолжить тест' : 'Начать тест'}<Arrow /></button>{chosenTopics.length > 0 && !questions.length && <p>Все вопросы знакомы. Измените настройки выбранных тем.</p>}</section>
        <section className="intro"><div className="eyebrow"><span />ЗНАНИЯ НАЧИНАЮТСЯ С ВОПРОСА</div><h1 ref={heading} tabIndex={-1}>О чём поговорим<span className="serif"> сегодня?</span></h1><p>Выберите темы, ответьте своими словами и соберите<br className="desktop-break" /> личный конспект. Только вы и ваши знания.</p></section>
        <div className="workspace">
          <section className="topics-section" aria-labelledby="topics-title">
            <div className="topic-create-row"><span>Открытые вопросы · отвечайте своими словами</span><button className="secondary" disabled={customLoad.failed || customTopics.length>=100} onClick={()=>setTopicEditor('new')}>+ Создать тему</button></div>
            <div className="course-discovery topic-discovery">
              <label className="course-search"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" placeholder="Найти тему" aria-label="Найти тему" value={topicQuery} onChange={event => setTopicQuery(event.target.value)} /></label>
              <Select label="Направление тем" value={topicDirection} onChange={setTopicDirection} options={[{value:'all',label:'Все направления'}, ...learningDirections.map(direction => ({value:direction.id,label:direction.title})), {value:'custom',label:'Свои темы'}, ...(topics.some(topic => !isCustomTopic(topic) && !topicDirections[topic.id]) ? [{value:'other',label:'Другие темы'}] : [])]} />
            </div>
            {filtersActive && <div className="topic-filter-status"><span role="status">Найдено тем: {visibleTopics.length} из {topics.length}. Выбрано всего: {chosenTopics.length}.</span><button className="text-button" onClick={() => { setTopicQuery(''); setTopicDirection('all') }}>Сбросить фильтры</button></div>}
            <div className="section-heading"><h2 id="topics-title">Выберите темы</h2><button className="text-button" disabled={!visibleTopics.length} onClick={() => setSession(s => ({ ...s, selected: visibleSelected === visibleTopics.length ? s.selected.filter(id => !visibleTopics.some(topic => topic.id === id)) : [...new Set([...s.selected, ...visibleTopics.map(topic => topic.id)])], index: 0 }))}>{visibleTopics.length > 0 && visibleSelected === visibleTopics.length ? (filtersActive ? 'Снять выбор найденных' : 'Снять выбор') : filtersActive ? 'Выбрать найденные' : 'Выбрать все'}</button></div>
            {!visibleTopics.length && <div className="course-empty"><p>Темы не найдены. Измените запрос или направление.</p></div>}
            {groupTopics(visibleTopics,[...learningDirections,{id:'custom',title:'Свои темы',description:'Вопросы, которые вы добавили самостоятельно.'},{id:'other',title:'Другие темы',description:'Дополнительные материалы.'}]).map(group=><DirectionGroup key={`${group.direction.id}:${topicQuery.trim()}:${topicDirection}`} title={group.direction.title} description={group.direction.description} count={`${countLabel(group.topics.length,'тема','темы','тем')} · выбрано: ${group.topics.filter(topic=>session.selected.includes(topic.id)).length}`}>
            <div className="topic-grid">{group.topics.map(topic => {
                const selected = session.selected.includes(topic.id)
                return <article key={topic.id} className={`topic-item ${selected ? 'selected' : ''}`}><button className={`topic-card ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => toggleTopic(topic.id)}>
                  <span className="card-top"><span className={`topic-symbol ${topic.color}`}>{topic.symbol}</span><span className="check-box" aria-hidden="true">{selected ? '✓' : ''}</span></span>
                  <strong>{topic.number}. {topic.title}</strong><span className="topic-description">{topic.description}</span><span className="topic-provenance">{isCustomTopic(topic) ? 'Своя тема' : 'Создано с помощью ИИ'}</span><span className="question-count">{countLabel(topic.questions.length, 'вопрос', 'вопроса', 'вопросов')} <span aria-hidden="true">↗</span></span>
                </button><button className="topic-settings-button" aria-label={`Настройки темы ${topic.title}`} onClick={() => setSettingsTopicId(topic.id)}><span aria-hidden="true">⚙</span> Настройки темы <span aria-hidden="true">↗</span></button>{isCustomTopic(topic) && <button className="topic-settings-button" onClick={()=>setTopicEditor(topic)} aria-label={`Изменить тему ${topic.title}`}>✎ Изменить свою тему</button>}</article>
            })}</div></DirectionGroup>)}
          </section>
          <aside className="session-card"><span className="eyebrow">ВАША СЕССИЯ</span><h2>Небольшой шаг.<br />Большая ясность.</h2><p>Не нужно искать идеальную формулировку. Запишите, как понимаете вы.</p><div className="session-stats"><div><span>Выбрано тем</span><strong>{chosenTopics.length.toString().padStart(2, '0')}</strong></div><div><span>Вопросов</span><strong>{questions.length.toString().padStart(2, '0')}</strong></div></div><button className="primary" disabled={!questions.length} onClick={startSession}>{answered ? 'Продолжить опрос' : 'Начать опрос'}<Arrow /></button><span className="session-note">В своём темпе. Без таймера.</span><div className="aside-foot"><span aria-hidden="true">↳</span><span>В конце — ваши вопросы и ответы<br />в одном документе.</span></div></aside>
        </div>
        <div className="bottom-note"><span aria-hidden="true">✳</span><p>Здесь нет вариантов ответа и оценок.<br /><strong>Есть место, чтобы подумать самостоятельно.</strong></p></div>
      </>}
      {session.stage === 'questions' && question && <>
        {answered === questions.length && <div className="test-ready no-print"><span>Вы ответили на все вопросы. Можно завершить тест прямо сейчас.</span><button className="primary" onClick={finish}>Завершить тест</button></div>}
        <div className="mobile-question-progress mobile-only"><div><span>{answered} из {questions.length} с ответом</span><button className="text-button" onClick={() => setShowQuestions(true)}>Все вопросы <span aria-hidden="true">▦</span></button></div><progress value={answered} max={questions.length} aria-label="Прогресс опроса" /></div>
        <section className="page-intro"><span className="eyebrow">ВРЕМЯ ПОДУМАТЬ</span><h1 ref={heading} tabIndex={-1}>Сформулируйте <span className="serif">свою мысль.</span></h1><p>Можно пропустить вопрос и вернуться к нему позже.</p></section>
        <div className="answer-workspace"><section className="answer-card"><div className="answer-top"><span className="topic-pill">{question.topic}</span><span>Вопрос {index + 1} из {questions.length}</span></div><h2 ref={questionHeading} tabIndex={-1} id="question-label">{question.text}</h2>{question.block && <span className="question-block">Блок: {question.block}</span>}<p className="content-provenance">{question.id.startsWith('custom-') ? 'Ваш вопрос' : 'Вопрос создан с помощью ИИ'}</p><label className="answer-label" htmlFor="answer">Ваш ответ</label><textarea id="answer" aria-labelledby="question-label" placeholder="Начните писать здесь…" value={session.answers[question.id] ?? ''} onChange={e => { const value=e.target.value; if(value.trim())recordStudy({kind:'answer',id:question.id});setSession(s => ({ ...s, answers: { ...s.answers, [question.id]: value } })) }} /><div className="answer-meta"><span>{saveFailed ? 'Не удалось сохранить в браузере' : 'Ответ сохраняется на этом устройстве'}</span><span>{(session.answers[question.id] ?? '').length} символов</span></div><div className="answer-actions"><button className="secondary" disabled={index === 0} onClick={() => setSession(s => ({ ...s, index: index - 1 }))}><Arrow back />Назад</button>{index < questions.length - 1 ? <button className="primary" onClick={() => setSession(s => ({ ...s, index: index + 1 }))}>Следующий вопрос<Arrow /></button> : <button className="primary" onClick={finish}>Посмотреть результат<Arrow /></button>}</div></section>
          <aside className="progress-card"><span className="eyebrow">ВАШ ПРОГРЕСС</span><div className="progress-number">{answered}<span> / {questions.length}</span></div><p>вопросов с ответом</p><progress value={answered} max={questions.length} aria-label="Заполнено вопросов" /><div className="question-nav" aria-label="Переход к вопросу">{questions.map((q, i) => <button key={q.id} aria-label={`Вопрос ${i + 1}${session.answers[q.id]?.trim() ? ', есть ответ' : ', без ответа'}`} aria-current={i === index ? 'step' : undefined} className={`${session.answers[q.id]?.trim() ? 'filled' : ''} ${i === index ? 'current' : ''}`} onClick={() => setSession(s => ({ ...s, index: i }))}>{i + 1}</button>)}</div><button className="text-button" onClick={() => setSession(s => ({ ...s, stage: 'topics' }))}>Изменить темы</button><button className="secondary finish-button" onClick={finish}>Завершить опрос</button><p className="small-note">Незаполненные ответы будут отмечены в документе.</p></aside></div>
      </>}
      {session.stage === 'result' && <>
        <p className="result-close-note no-print">Тест завершён. Здесь можно сохранить конспект или отредактировать ответы. После выхода на главную следующий тест начнётся с пустыми ответами.</p>
        <section className="page-intro no-print"><span className="eyebrow">МЫСЛИ ОБРЕЛИ ФОРМУ</span><h1 ref={heading} tabIndex={-1}>Ваш личный <span className="serif">конспект.</span></h1><p>Сохраните ответы и возвращайтесь к ним, чтобы увидеть свой рост.</p></section>
        <div className="mobile-result-actions mobile-only no-print"><button className="text-button" onClick={() => setSession(s => ({ ...s, stage: 'questions' }))}>Редактировать ответы</button><button className="text-button" onClick={() => setShowReset(true)}>Новый опрос</button></div>
        <div className="mobile-result-summary mobile-only no-print"><span className="result-check" aria-hidden="true">✓</span><h2>Готово. Мысли записаны.</h2><p>Раскройте тему, чтобы перечитать ответы.</p><div><span><strong>{answered}</strong>с ответом</span><span><strong>{questions.length - answered}</strong>пропущено</span><span><strong>{activeTopics.length}</strong>{russianPlural.select(activeTopics.length) === 'one' ? 'тема' : russianPlural.select(activeTopics.length) === 'few' ? 'темы' : 'тем'}</span></div></div>
        <div className="result-home no-print"><button className="primary" onClick={goHome}><Arrow back />На главную</button></div>
        <div className="result-toolbar no-print"><div><strong>{answered} из {questions.length}</strong><span> вопросов заполнено · {questions.length ? Math.round(answered / questions.length * 100) : 0}%</span></div><div className="export-actions"><button className="secondary" onClick={copyText}>Копировать</button><button className="secondary" onClick={downloadText}>{isAndroid ? 'Сохранить / отправить .txt' : 'Скачать .txt'}</button><button className="primary" onClick={savePdf}>Сохранить PDF <span aria-hidden="true">↓</span></button></div></div><p className="pdf-help no-print">Для PDF в окне печати выберите «Сохранить как PDF».</p>
        <article className="document"><header className="document-header"><span className="eyebrow">ANSWERBOOK / ЛИЧНЫЙ КОНСПЕКТ</span><h2>Вопросы и мои ответы</h2><p>{session.completedAt && new Date(session.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {countLabel(activeTopics.length, 'тема', 'темы', 'тем')} · {countLabel(questions.length, 'вопрос', 'вопроса', 'вопросов')}</p></header>{activeTopics.map(topic => (
          <section className={`document-topic ${expandedTopics.includes(topic.id) ? 'is-expanded' : ''}`} key={topic.id}>
            <button className="document-topic-toggle mobile-only no-print" aria-expanded={expandedTopics.includes(topic.id)} aria-controls={`answers-${topic.id}`} onClick={() => setExpandedTopics(current => current.includes(topic.id) ? current.filter(id => id !== topic.id) : [...current, topic.id])}><span><strong>{topic.title}</strong><small>{topic.questions.filter(q => session.answers[q.id]?.trim()).length} из {topic.questions.length} с ответом</small></span><span className="topic-chevron" aria-hidden="true">⌄</span></button>
            <h3 className="document-topic-title desktop-only">{topic.number}. {topic.title}</h3>
            <div className="document-answers" id={`answers-${topic.id}`}>{topic.questions.map((q, number) => <div className="document-answer" key={q.id}>
              <h4>{number + 1}. {q.text}</h4>
              <p className={!session.answers[q.id]?.trim() ? 'unanswered' : ''}>{session.answers[q.id]?.trim() || 'Ответ не указан.'}</p>
            </div>)}</div>
          </section>
        ))}</article>
        <div className="mobile-result-bottom mobile-only no-print" aria-label="Действия с результатом"><button className="secondary" onClick={goHome}>На главную</button><button className="primary" onClick={() => setShowExport(true)}>Сохранить <span aria-hidden="true">↓</span></button></div>
        <div className="result-bottom no-print"><button className="primary" onClick={goHome}><Arrow back />На главную</button><button className="secondary" onClick={() => setSession(s => ({ ...s, stage: 'questions' }))}>Редактировать ответы</button><button className="text-button" onClick={() => setShowReset(true)}>Начать новый опрос</button></div>
      </>}
      </>}
    </main>
    <MobileNavigation active={view} onNavigate={navigate} />
    {topicEditor && <CustomTopicEditor key={topicEditor === 'new' ? 'new' : topicEditor.id} topic={topicEditor === 'new' ? null : topicEditor} onClose={()=>setTopicEditor(null)} onSave={async topic=>{
      const next=customTopics.some(item=>item.id===topic.id) ? customTopics.map(item=>item.id===topic.id ? topic : item) : [...customTopics,topic]
      mergeTopics(baseTopics,next)
      try {await writeStored(customTopicsKey,JSON.stringify(next))} catch {throw new Error('Не удалось сохранить тему на устройстве. Освободите место и повторите сохранение.')}
      setCustomTopics(next)
      setSession(current=>({...current,selected:[...new Set([...current.selected,topic.id])]}))
      setTopicQuery('');setTopicDirection('custom')
    }} />}
    <KnowledgeSettings topic={availableTopics.find(topic => topic.id === settingsTopicId) ?? null} knowledge={knowledge} onChange={setKnowledge} onClose={() => setSettingsTopicId(null)} disabled={knowledgeLoad.failed} saveFailed={knowledgeSaveFailed} />
    <footer className="site-footer no-print"><span>answerbook · Учиться, размышлять, формулировать.</span><span className={saveFailed ? 'save-error' : ''}>{saveFailed ? 'Хранилище недоступно. Скачайте ответы перед закрытием.' : 'Ваши ответы сохраняются на этом устройстве'}</span></footer>
    {notice && <div className="toast no-print" role="status">{notice}</div>}
    <dialog ref={resetDialog} onCancel={() => setShowReset(false)} className="reset-dialog"><h2>Начать с чистого листа?</h2><p>Текущие ответы будут удалены с этого устройства. Сначала сохраните конспект, если хотите оставить его.</p><div className="answer-actions"><button className="secondary" onClick={() => setShowReset(false)}>Отмена</button><button className="primary" onClick={() => { setSession(freshSession()); setShowReset(false) }}>Начать заново</button></div></dialog>
    <dialog ref={questionsDialog} onCancel={() => setShowQuestions(false)} className="mobile-sheet no-print" aria-labelledby="questions-sheet-title">
      <div className="sheet-handle" aria-hidden="true" /><div className="sheet-heading"><h2 id="questions-sheet-title">Вопросы опроса</h2><button className="icon-button" onClick={() => setShowQuestions(false)} aria-label="Закрыть список вопросов">×</button></div>
      <p className="sheet-caption">{answered} из {questions.length} с ответом. Выберите номер для перехода.</p>
      <div className="question-nav sheet-question-nav" aria-label="Список вопросов">{questions.map((q, i) => <button key={q.id} aria-label={`Перейти к вопросу ${i + 1}${session.answers[q.id]?.trim() ? ', есть ответ' : ', без ответа'}`} aria-current={i === index ? 'step' : undefined} className={`${session.answers[q.id]?.trim() ? 'filled' : ''} ${i === index ? 'current' : ''}`} onClick={() => selectQuestion(i)}>{i + 1}</button>)}</div>
      <button className="secondary sheet-finish" onClick={finish}>Завершить опрос</button>
    </dialog>
    <dialog ref={exportDialog} onCancel={() => setShowExport(false)} className="mobile-sheet no-print" aria-labelledby="export-sheet-title">
      <div className="sheet-handle" aria-hidden="true" /><div className="sheet-heading"><h2 id="export-sheet-title">Сохранить конспект</h2><button className="icon-button" onClick={() => setShowExport(false)} aria-label="Закрыть меню сохранения">×</button></div>
      <p className="sheet-caption">Все выбранные вопросы и ваши ответы.</p>
      <button className="export-option" onClick={() => { closeExport(); void savePdf() }}><span className="export-symbol">PDF</span><span><strong>Документ PDF</strong><small>Выберите «Сохранить как PDF» в окне печати</small></span><span aria-hidden="true">↗</span></button>
      <button className="export-option" onClick={() => { closeExport(); void downloadText() }}><span className="export-symbol">TXT</span><span><strong>Текстовый файл</strong><small>{isAndroid ? 'Сохранить или отправить в другое приложение' : 'Скачать вопросы и ответы'}</small></span><span aria-hidden="true">↗</span></button>
      <button className="export-option" onClick={() => { closeExport(); void copyText() }}><span className="export-symbol">Aa</span><span><strong>Копировать текст</strong><small>Вопросы и ответы в буфер обмена</small></span><span aria-hidden="true">↗</span></button>
    </dialog>
  </div>
}
export default App
