import {freshExercise,restoreExercises} from './exercises.ts'
import type {Exercise,ExerciseState} from './exercises.ts'
import {expandCourseStructure,stepView} from './courseStructure.ts'
import type {CourseModule,CourseStep} from './courseStructure.ts'
import type {CoursePlan} from './coursePlan.ts'
import { shuffled, isOptionOrder } from './shuffle.ts'
type BaseQuestion = { id: string; prompt: string; explanation: string; code?: string }
export type LearningQuestion = BaseQuestion & ({ kind: 'choice'; options: string[]; correct: number } | { kind:'multi';options:string[];correct:number[] } | { kind: 'output'; answers: string[] })
export const learningQuestionFingerprint=(q:LearningQuestion)=>JSON.stringify({id:q.id,kind:q.kind,prompt:q.prompt,code:q.code,explanation:q.explanation,...(q.kind!=='output' ? {options:q.options,correct:q.correct} : {answers:q.answers})})
export type ReadingSection = { title:string; source:string; pages:string; content:{kind:'paragraph'|'heading'|'code'|'table';text:string}[] }
export type Lesson = { exercise?:Exercise; id: string; title: string; source?: string; pages: string; theory: string[]; reading?:ReadingSection[]; questions: LearningQuestion[]; step?:CourseStep }
export type LearningCourse = { id: string; version: number; title: string; description: string; source: string; lessons: Lesson[]; formatVersion?:2; modules?:CourseModule[]; plan?:CoursePlan; previous?:LearningCourse;assessment?:{practiceUngraded:boolean;bulkSubmission:boolean} }
export type ResultSummary = { id:string; courseVersion:number; finishedAt:string|null; total:number; correct:number; percent:number }
export type LearningResult = ResultSummary & { title:string; items:{lessonId:string;lessonTitle:string;question:LearningQuestion;answer:string}[] }
export type MistakeReview = {sourceResultId:string;courseVersion:number;title:string;items:LearningResult['items'];answers:Record<string,string>;checkedAnswers:Record<string,string>;optionOrders:Record<string,number[]>;finished:boolean;lastResult?:LearningResult;results:ResultSummary[]}
export type AssessmentRecord={first:LearningResult;best:LearningResult;last:LearningResult}
export type LearningAttempt = { exercises?:Record<string,ExerciseState>; assessments?:Record<string,AssessmentRecord>; courseVersion: number; lessonId: string; view: 'theory' | 'practice' | 'all'; answers: Record<string, string>; finished: boolean; resumeView?: 'theory' | 'practice'; previousEdition?: string; startedAt?:string; checkedAnswers?:Record<string,string>; lastResult?:LearningResult; results?:ResultSummary[];optionOrders?:Record<string,number[]>;review?:MistakeReview }

export function learningStorageKey(courseId: string) {
  return courseId === 'csharp-language-oop' ? 'answerbook.learning.csharp.v1' : `answerbook.learning.${courseId}.v1`
}

export function openLearningAttempt(raw: string | null, course: LearningCourse, mode: 'learn' | 'exam' | 'result', previous?:LearningCourse): LearningAttempt {
  let saved = restoreLearningAttempt(raw, course, previous)
  if (mode === 'result' || saved.finished && mode === 'learn') return saved
  if (saved.finished && mode === 'exam') saved = restartLearningAttempt(course, saved)
  const resumeView = saved.view === 'all' ? saved.resumeView ?? 'theory' : saved.view
  return withOptionOrders(course,{ ...saved, resumeView, view: mode === 'exam' ? 'all' : resumeView })
}

export function validateLearningCourse(value: unknown): LearningCourse {
  const raw = value as LearningCourse
  if(raw?.formatVersion!==undefined && raw.formatVersion!==2)throw new Error('Неизвестный формат курса')
  const course = raw?.modules!==undefined || raw?.formatVersion===2 ? expandCourseStructure(value) : raw
  const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
  if (!course || !nonempty(course.id) || !nonempty(course.title) || !nonempty(course.description) || (!course.modules && !nonempty(course.source)) || !Number.isInteger(course.version) || course.version < 1 || !Array.isArray(course.lessons) || !course.lessons.length) throw new Error('Неверный учебный курс')
  if(course.assessment && (typeof course.assessment.practiceUngraded!=='boolean'||typeof course.assessment.bulkSubmission!=='boolean'))throw new Error('Неверные правила оценки')
  const lessonIds = new Set<string>(), questionIds = new Set<string>()
  for (const lesson of course.lessons) {
    if (!lesson || !nonempty(lesson.id) || lessonIds.has(lesson.id) || !nonempty(lesson.title) || (lesson.source !== undefined && !nonempty(lesson.source)) || (!course.modules && !nonempty(lesson.pages)) || !Array.isArray(lesson.theory) || (!course.modules && !lesson.theory.length) || !lesson.theory.every(nonempty) || !Array.isArray(lesson.questions) || (!lesson.questions.length && !(course.modules && (lesson.step?.kind==='theory'||lesson.step?.kind==='exercise')))) throw new Error('Неверный блок курса')
    lessonIds.add(lesson.id)
    if(lesson.exercise&&lesson.step?.kind!=='exercise')throw new Error('Упражнение вне интерактивного шага')
    for (const q of lesson.questions) {
      if (!q || !nonempty(q.id) || questionIds.has(q.id) || !nonempty(q.prompt) || !nonempty(q.explanation) || (q.code !== undefined && !nonempty(q.code))) throw new Error('Неверное задание')
      questionIds.add(q.id)
      if (q.kind === 'choice') {
        if (!Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options).size !== 4 || !q.options.every(nonempty) || !Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) throw new Error('Неверные варианты ответа')
      } else if(q.kind==='multi') {
        if(!Array.isArray(q.options)||q.options.length!==4||new Set(q.options).size!==4||!q.options.every(nonempty)||!Array.isArray(q.correct)||q.correct.length<2||q.correct.length>4||new Set(q.correct).size!==q.correct.length||q.correct.some(i=>!Number.isInteger(i)||i<0||i>3))throw new Error('Неверные варианты множественного ответа')
      } else if (q.kind === 'output') {
        if (!Array.isArray(q.answers) || !q.answers.length || !q.answers.every(nonempty)) throw new Error('Не задан ожидаемый вывод')
      } else throw new Error('Неизвестный вид задания')
    }
  }
  return course
}
export const scoredLessons=(course:LearningCourse)=>course.lessons.filter(l=>!course.assessment?.practiceUngraded || l.step?.kind!=='inline-test')
export const scoredLearningQuestions=(course:LearningCourse)=>scoredLessons(course).flatMap(l=>l.questions)
export const allLearningQuestions = (course: LearningCourse) => course.lessons.flatMap(lesson => lesson.questions)
export const freshLearningAttempt = (course: LearningCourse): LearningAttempt => ({ courseVersion: course.version, lessonId: course.lessons[0].id, view: stepView(course.lessons[0]), answers: {}, finished: false })

export function hasLearningAnswer(question: LearningQuestion, answer: string | undefined) {
  if (typeof answer !== 'string') return false
  return question.kind === 'choice' ? /^[0-3]$/.test(answer) : question.kind==='multi' ? /^[0-3](,[0-3])*$/.test(answer) && new Set(answer.split(',')).size===answer.split(',').length : !!answer.trim()
}
const normalizeOutput = (value: string) => value.trim().replace(/\s+/g, ' ')
export function isLearningCorrect(question: LearningQuestion, answer: string | undefined) {
  if (!hasLearningAnswer(question, answer)) return false
  return question.kind === 'choice' ? answer === String(question.correct) : question.kind==='multi' ? [...answer!.split(',').map(Number)].sort().join(',')===[...question.correct].sort().join(',') : question.answers.some(expected => normalizeOutput(answer!) === normalizeOutput(expected))
}
export function learningScore(course: LearningCourse, attempt: LearningAttempt) {
  const questions = scoredLearningQuestions(course)
  const answered = questions.filter(q => hasLearningAnswer(q, attempt.answers[q.id])).length
  const correct = questions.filter(q => isLearningCorrect(q, attempt.answers[q.id])).length
  return { total: questions.length, answered, correct, percent: Math.round(correct / questions.length * 100), canFinish: answered === questions.length }
}
export function finishLearningAttempt(course: LearningCourse, attempt: LearningAttempt, now = new Date()): LearningAttempt {
  if (attempt.finished) return attempt
  if (!learningScore(course, attempt).canFinish) throw new Error('Ответьте на все вопросы, чтобы завершить тест')
  const lastResult = makeLearningResult(course, attempt, now.toISOString())
  const { items: _items, title: _title, ...summary } = lastResult
  let completed=attempt
  if(course.assessment?.bulkSubmission)for(const lesson of scoredLessons(course))if(lesson.questions.length)completed=submitLessonAssessment(course,completed,lesson.id,now)
  return { ...completed, finished: true, lastResult, results:[...(attempt.results ?? []),summary].slice(-20) }
}

export function makeLearningResult(course:LearningCourse, attempt:LearningAttempt, finishedAt:string|null):LearningResult {
  const items = scoredLessons(course).flatMap(lesson => lesson.questions.map(question => ({lessonId:lesson.id,lessonTitle:lesson.step ? `${lesson.step.moduleTitle} · ${lesson.step.unitLessonTitle} · ${lesson.title}` : lesson.title,question:structuredClone(question),answer:attempt.answers[question.id] ?? ''})))
  const correct = items.filter(item => isLearningCorrect(item.question,item.answer)).length
  return {id:`${finishedAt ?? 'previous'}-${course.version}-${attempt.results?.length ?? 0}`,courseVersion:course.version,title:course.title,finishedAt,total:items.length,correct,percent:Math.round(correct/items.length*10000)/100,items}
}

export function restartLearningAttempt(course:LearningCourse, attempt:LearningAttempt):LearningAttempt {
  const next={ ...freshLearningAttempt(course), ...(attempt.exercises?{exercises:attempt.exercises}:{}), ...(attempt.lastResult ? {lastResult:attempt.lastResult} : {}), ...(attempt.results ? {results:attempt.results} : {}), ...(attempt.review ? {review:attempt.review} : {}), ...(attempt.assessments ? {assessments:attempt.assessments} : {}), startedAt:new Date().toISOString() }
  return withOptionOrders(course,next,Math.random,attempt.optionOrders)
}

export function withOptionOrders(course:LearningCourse,attempt:LearningAttempt,random:()=>number=Math.random,previous?:Record<string,number[]>):LearningAttempt {
  const optionOrders=Object.fromEntries(allLearningQuestions(course).filter(q=>q.kind!=='output').map(q=>[q.id,isOptionOrder(attempt.optionOrders?.[q.id]) ? attempt.optionOrders![q.id] : shuffled([0,1,2,3],random,previous?.[q.id])]))
  return {...attempt,optionOrders}
}
export function startMistakeReview(result:LearningResult,previous?:MistakeReview,random:()=>number=Math.random):MistakeReview|null {
  const source=previous?.sourceResultId===result.id && previous.finished && previous.lastResult ? previous.lastResult : result
  const items=source.items.filter(item=>!isLearningCorrect(item.question,item.answer)).map(item=>structuredClone(item))
  if(!items.length)return null
  return {sourceResultId:result.id,courseVersion:result.courseVersion,title:result.title,items,answers:{},checkedAnswers:{},optionOrders:Object.fromEntries(items.filter(i=>i.question.kind!=='output').map(i=>[i.question.id,shuffled([0,1,2,3],random,previous?.optionOrders[i.question.id])])),finished:false,results:previous?.results ?? [],...(previous?.lastResult ? {lastResult:previous.lastResult} : {})}
}
export function answerMistake(review:MistakeReview,id:string,value:string):MistakeReview {
  if(review.finished || review.checkedAnswers[id]!==undefined || !review.items.some(i=>i.question.id===id))return review
  return {...review,answers:{...review.answers,[id]:value}}
}
export function checkMistake(review:MistakeReview,id:string):MistakeReview {
  const item=review.items.find(i=>i.question.id===id)
  if(review.finished || !item || !hasLearningAnswer(item.question,review.answers[id]) || review.checkedAnswers[id]!==undefined)return review
  return {...review,checkedAnswers:{...review.checkedAnswers,[id]:review.answers[id]}}
}
export function finishMistakeReview(review:MistakeReview,now=new Date()):MistakeReview {
  if(review.finished)return review
  if(!review.items.every(i=>hasLearningAnswer(i.question,review.answers[i.question.id]) && review.checkedAnswers[i.question.id]===review.answers[i.question.id]))throw new Error('Проверьте все ответы работы над ошибками')
  const items=review.items.map(i=>({...structuredClone(i),answer:review.answers[i.question.id]}))
  const correct=items.filter(i=>isLearningCorrect(i.question,i.answer)).length
  const summary:ResultSummary={id:crypto.randomUUID(),courseVersion:review.courseVersion,finishedAt:now.toISOString(),total:items.length,correct,percent:Math.round(correct/items.length*10000)/100}
  return {...review,finished:true,lastResult:{...summary,title:review.title,items},results:[...review.results,summary].slice(-20)}
}

export const isBulkAssessment=(course:LearningCourse,lesson:Lesson|undefined)=>!!course.assessment?.bulkSubmission && !!lesson?.questions.length && lesson.step?.kind!=='inline-test'
export function submitLessonAssessment(course:LearningCourse,attempt:LearningAttempt,stepId=attempt.lessonId,now=new Date()):LearningAttempt {
  const lesson=course.lessons.find(l=>l.id===stepId)
  if(attempt.finished || !lesson || !lesson.questions.length)return attempt
  if(!lesson.questions.every(q=>hasLearningAnswer(q,attempt.answers[q.id])))throw new Error('Ответьте на все задания теста')
  if(lesson.questions.every(q=>isAnswerChecked(attempt,q)))return attempt
  const result=makeLearningResult({...course,modules:undefined,assessment:undefined,lessons:[lesson]},attempt,now.toISOString())
  const old=attempt.assessments?.[stepId]
  const record={first:old?.first??result,best:old && old.best.percent>=result.percent ? old.best : result,last:result}
  return {...attempt,checkedAnswers:{...attempt.checkedAnswers,...Object.fromEntries(lesson.questions.map(q=>[q.id,attempt.answers[q.id]]))},assessments:{...attempt.assessments,[stepId]:record}}
}
export function retryLessonAssessment(course:LearningCourse,attempt:LearningAttempt):LearningAttempt {
  if(attempt.finished)return attempt
  const lesson=course.lessons.find(l=>l.id===attempt.lessonId)
  if(!lesson)return attempt
  const answers={...attempt.answers},checkedAnswers={...attempt.checkedAnswers},optionOrders={...attempt.optionOrders}
  for(const q of lesson.questions){delete answers[q.id];delete checkedAnswers[q.id];if(q.kind!=='output')optionOrders[q.id]=shuffled([0,1,2,3],Math.random,optionOrders[q.id])}
  return {...attempt,answers,checkedAnswers,optionOrders}
}

export function checkLearningAnswer(course:LearningCourse, attempt:LearningAttempt, questionId:string):LearningAttempt {
  if (attempt.finished || attempt.view !== 'practice' || isBulkAssessment(course,course.lessons.find(l=>l.id===attempt.lessonId)!)) return attempt
  const question = course.lessons.find(l => l.id === attempt.lessonId)?.questions.find(q => q.id === questionId)
  if (!question || !hasLearningAnswer(question,attempt.answers[questionId]) || attempt.checkedAnswers?.[questionId] === attempt.answers[questionId]) return attempt
  return {...attempt,checkedAnswers:{...attempt.checkedAnswers,[questionId]:attempt.answers[questionId]}}
}

export function isAnswerChecked(attempt:LearningAttempt, question:LearningQuestion) {
  return hasLearningAnswer(question,attempt.answers[question.id]) && attempt.checkedAnswers?.[question.id] === attempt.answers[question.id]
}

export function learningProgress(course:LearningCourse, attempt:LearningAttempt) {
  const score = learningScore(course,attempt)
  const all=allLearningQuestions(course),answered=all.filter(q=>hasLearningAnswer(q,attempt.answers[q.id])).length
  return { started:!!(attempt.startedAt || score.answered || attempt.finished || attempt.lastResult), percent:attempt.finished ? 100 : Math.round(answered/all.length*10000)/100, completed:attempt.finished || attempt.lastResult?.courseVersion === course.version }
}

export function resultItems(result:LearningResult) {
  return [...result.items].sort((a,b) => Number(isLearningCorrect(a.question,a.answer))-Number(isLearningCorrect(b.question,b.answer)))
}

export function initializeExerciseStep(course:LearningCourse,attempt:LearningAttempt):LearningAttempt {
  const exercise=course.lessons.find(l=>l.id===attempt.lessonId)?.exercise
  if(!exercise||attempt.exercises?.[exercise.id]||attempt.view==='all')return attempt
  return {...attempt,exercises:{...attempt.exercises,[exercise.id]:freshExercise(exercise)}}
}

export function nextLearningStep(course: LearningCourse, attempt: LearningAttempt): LearningAttempt {
  if (attempt.finished || attempt.view === 'all') return attempt
  if (attempt.view === 'theory' && !course.modules) return { ...attempt, view: 'practice' }
  const index = course.lessons.findIndex(lesson => lesson.id === attempt.lessonId)
  const lesson = course.lessons[index]
  if (!lesson || !lesson.questions.every(q => isAnswerChecked(attempt,q))) return attempt
  if (index < course.lessons.length - 1) return initializeExerciseStep(course,{ ...attempt, lessonId: course.lessons[index + 1].id, view: stepView(course.lessons[index + 1]) })
  return learningScore(course, attempt).canFinish ? finishLearningAttempt(course, attempt) : { ...attempt, view: 'all' }
}

export function previousLearningStep(course: LearningCourse, attempt: LearningAttempt): LearningAttempt {
  if (attempt.finished || attempt.view === 'all') return attempt
  if (attempt.view === 'practice' && !course.modules) return { ...attempt, view: 'theory' }
  const index = course.lessons.findIndex(lesson => lesson.id === attempt.lessonId)
  return index > 0 ? initializeExerciseStep(course,{ ...attempt, lessonId: course.lessons[index - 1].id, view: course.modules ? stepView(course.lessons[index - 1]) : 'practice' }) : attempt
}
export function restoreLearningAttempt(raw: string | null, course: LearningCourse, previous?:LearningCourse): LearningAttempt {
  if (raw === null) return freshLearningAttempt(course)
  const value = JSON.parse(raw) as LearningAttempt
  if (!value || !Number.isInteger(value.courseVersion) || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers) || typeof value.finished !== 'boolean') throw new Error('Неверное сохранение курса')
  let lastResult = value.lastResult
  if (lastResult !== undefined) validateLearningResult(lastResult)
  if (!lastResult && value.finished) {
    let source:LearningCourse|undefined=course
    if(source.version!==value.courseVersion)source=previous
    while(source && source.version!==value.courseVersion)source=source.previous
    if (source) lastResult=makeLearningResult(source,value,null)
  }
  if (value.results !== undefined && (!Array.isArray(value.results) || value.results.length>20 || value.results.some(item => !validSummary(item)))) throw new Error('Неверная история результатов')
  // Preserve unchanged questions, even if moved; changed questions need new answers.
  // Keep the original save as well, including answers to removed/moved questions.
  let previousEdition = value.courseVersion !== course.version ? raw : value.previousEdition
  // Retain one previous edition, rather than recursively escaping every older
  // save on each content update (which can exhaust localStorage).
  if(typeof previousEdition==='string') {
    try {
      const archived=JSON.parse(previousEdition)
      if(archived && typeof archived==='object' && Object.hasOwn(archived,'previousEdition')) {
        delete archived.previousEdition
        previousEdition=JSON.stringify(archived)
      }
    } catch { /* Keep an opaque legacy archive if it cannot be normalized. */ }
  }
  const answers: Record<string, string> = {}
  let priorEdition=previous ?? course.previous
  while(priorEdition && priorEdition.version!==value.courseVersion)priorEdition=priorEdition.previous
  const priorQuestions=new Map(priorEdition ? allLearningQuestions(priorEdition).map(q=>[q.id,q]) : lastResult?.courseVersion===value.courseVersion ? lastResult.items.map(item=>[item.question.id,item.question]) : [])
  const changedQuestions=new Set(value.courseVersion===course.version ? [] : allLearningQuestions(course).filter(q=>{
    const prior=priorQuestions.get(q.id)
    return prior && learningQuestionFingerprint(prior)!==learningQuestionFingerprint(q)
  }).map(q=>q.id))
  for (const q of allLearningQuestions(course)) if (!changedQuestions.has(q.id) && hasLearningAnswer(q, value.answers[q.id])) answers[q.id] = value.answers[q.id]
  if(value.optionOrders!==undefined && (!value.optionOrders || typeof value.optionOrders!=='object' || Array.isArray(value.optionOrders) || Object.values(value.optionOrders).some(order=>!isOptionOrder(order))))throw new Error('Неверный порядок вариантов')
  if(value.review!==undefined)validateMistakeReview(value.review)
  const checkedAnswers:Record<string,string>={}
  for (const q of allLearningQuestions(course)) if (value.checkedAnswers?.[q.id] === answers[q.id] && hasLearningAnswer(q,answers[q.id])) checkedAnswers[q.id]=answers[q.id]
  const resultQuestions=new Map(lastResult?.items.map(item=>[item.question.id,item]))
  // A theory-only edition must not turn a completed, unchanged assessment into a new attempt.
  const sameAssessment=!!lastResult && lastResult.total===scoredLearningQuestions(course).length && scoredLearningQuestions(course).every(q=>{
    const item=resultQuestions.get(q.id)
    return !!item && item.answer===answers[q.id] && learningQuestionFingerprint(item.question)===learningQuestionFingerprint(q)
  })
  if(value.assessments!==undefined){if(!value.assessments||typeof value.assessments!=='object'||Array.isArray(value.assessments)||Object.keys(value.assessments).length>10000)throw new Error('Неверные результаты тестов');for(const record of Object.values(value.assessments)){if(!record)throw new Error('Неверный результат теста');validateLearningResult(record.first);validateLearningResult(record.best);validateLearningResult(record.last)}}
  const exercises=restoreExercises(value.exercises,course.lessons.flatMap(l=>l.exercise?[l.exercise]:[]))
  const currentLesson=course.lessons.find(l=>l.id===value.lessonId)
  const priorExerciseId=previous?.lessons.find(l=>l.id===value.lessonId)?.exercise?.id
  const savedBlockId=typeof value.lessonId==='string'?value.lessonId.split('/').at(-1):undefined
  // Placement changes keep exercise fingerprints. Resume the same validated exercise
  // even when its enclosing module/lesson changed; never guess among ambiguous blocks.
  const relocated=currentLesson?[]:course.lessons.filter(l=>l.exercise&&exercises[l.exercise.id]&&(priorExerciseId?l.exercise.id===priorExerciseId:!!savedBlockId&&l.id.split('/').at(-1)===savedBlockId))
  const restoredLesson=currentLesson ?? (relocated.length===1?relocated[0]:undefined) ?? course.lessons[0]
  return initializeExerciseStep(course,{ ...(value.exercises?{exercises}:{}), ...(value.assessments ? {assessments:value.assessments} : {}), courseVersion: course.version, answers, lessonId: restoredLesson.id, view: value.view==='all' ? 'all' : course.modules ? stepView(restoredLesson) : ['theory', 'practice'].includes(value.view) ? value.view : 'theory', finished: value.finished && (value.courseVersion === course.version || sameAssessment), ...(value.resumeView === 'theory' || value.resumeView === 'practice' ? { resumeView:course.modules ? stepView(restoredLesson) : value.resumeView } : {}), ...(typeof previousEdition === 'string' ? { previousEdition } : {}), ...(value.checkedAnswers ? {checkedAnswers} : {}), ...(typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) ? {startedAt:value.startedAt} : {}), ...(lastResult ? {lastResult} : {}), ...(value.results ? {results:value.results} : {}), ...(value.optionOrders ? {optionOrders:Object.fromEntries(allLearningQuestions(course).filter(q=>q.kind!=='output' && value.optionOrders?.[q.id]).map(q=>[q.id,value.optionOrders![q.id]]))} : {}), ...(value.review ? {review:value.review} : {}) })
}

function validSummary(result:ResultSummary) {
  return result && typeof result.id==='string' && Number.isInteger(result.courseVersion) && result.courseVersion>0 && Number.isInteger(result.total) && result.total>0 && Number.isInteger(result.correct) && result.correct>=0 && result.correct<=result.total && result.percent===Math.round(result.correct/result.total*10000)/100 && (result.finishedAt===null || typeof result.finishedAt==='string' && Number.isFinite(Date.parse(result.finishedAt)))
}
function validateLearningResult(result:LearningResult) {
  if (!validSummary(result) || typeof result.title!=='string' || !Array.isArray(result.items) || result.items.length!==result.total || result.items.some(i => !i || typeof i.lessonId!=='string' || typeof i.lessonTitle!=='string' || typeof i.answer!=='string')) throw new Error('Неверный сохранённый результат')
  validateLearningCourse({id:'saved',version:1,title:'saved',description:'saved',source:'saved',lessons:[{id:'all',title:'saved',pages:'1',theory:['saved'],questions:result.items.map(i=>i.question)}]})
  if (result.correct!==result.items.filter(i=>isLearningCorrect(i.question,i.answer)).length) throw new Error('Повреждена оценка результата')
}

function validateMistakeReview(review:MistakeReview) {
  if(!review || typeof review.sourceResultId!=='string' || typeof review.finished!=='boolean' || !review.answers || Array.isArray(review.answers) || !review.checkedAnswers || Array.isArray(review.checkedAnswers) || !review.optionOrders || Array.isArray(review.optionOrders) || !Array.isArray(review.results) || review.results.length>20 || review.results.some(s=>!validSummary(s)))throw new Error('Неверная работа над ошибками')
  validateLearningResult({id:review.sourceResultId,courseVersion:review.courseVersion,title:review.title,finishedAt:null,total:review.items?.length,correct:0,percent:0,items:review.items})
  for(const item of review.items) {
    const id=item.question.id,answer=review.answers[id],checked=review.checkedAnswers[id]
    if(answer!==undefined && (typeof answer!=='string' || item.question.kind!=='output' && !hasLearningAnswer(item.question,answer)) || checked!==undefined && (checked!==answer || !hasLearningAnswer(item.question,checked)) || item.question.kind!=='output' && !isOptionOrder(review.optionOrders[id]))throw new Error('Неверный ответ повторения')
  }
  if(review.lastResult)validateLearningResult(review.lastResult)
  if(review.finished && (!review.lastResult || !review.items.every(i=>hasLearningAnswer(i.question,review.answers[i.question.id]) && review.checkedAnswers[i.question.id]===review.answers[i.question.id])))throw new Error('Повторение не завершено')
}

// Completion counts submitted assessment answers, independently of accuracy.
export function learningModuleProgress(course:LearningCourse,attempt:LearningAttempt) {
  const modules=(course.modules??[]).map(module=>{
    const questions=course.lessons.filter(l=>l.step?.moduleId===module.id && (!course.assessment?.practiceUngraded||l.step.kind!=='inline-test')).flatMap(l=>l.questions)
    const completed=questions.filter(q=>isAnswerChecked(attempt,q)||(attempt.finished&&hasLearningAnswer(q,attempt.answers[q.id]))).length
    return {id:module.id,total:questions.length,completed,percent:questions.length?Math.round(completed/questions.length*10000)/100:0,finished:questions.length>0&&completed===questions.length}
  })
  return {modules,completed:modules.filter(m=>m.finished).length,total:modules.length}
}
