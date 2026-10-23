import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkLearningAnswer, validateLearningCourse, freshLearningAttempt, restoreLearningAttempt, learningScore, finishLearningAttempt, isLearningCorrect, nextLearningStep, previousLearningStep } from '../src/lib/learning.ts'
import { newerCatalog, validateCatalog } from '../src/lib/catalog.ts'

const course = validateLearningCourse(JSON.parse(readFileSync(new URL('../src/data/csharp-foundations-course.json', import.meta.url), 'utf8')))
const catalog = validateCatalog(JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8')))

test('course alternates theory and block practice, preserves answers and waits for a complete block', () => {
  let attempt = freshLearningAttempt(course)
  assert.equal(previousLearningStep(course, attempt), attempt)
  attempt = nextLearningStep(course, attempt)
  assert.equal(attempt.view, 'practice')
  assert.equal(nextLearningStep(course, attempt), attempt)
  const questions = course.lessons[0].questions
  attempt.answers[questions[0].id] = '0'
  assert.equal(nextLearningStep(course, attempt), attempt)
  for (const q of questions) {attempt.answers[q.id] = q.kind === 'choice' ? String(q.correct) : q.answers[0];attempt=checkLearningAnswer(course,attempt,q.id)}
  const next = nextLearningStep(course, attempt)
  assert.equal(next.lessonId, course.lessons[1].id)
  assert.equal(next.view, 'theory')
  assert.deepEqual(next.answers, attempt.answers)
  assert.deepEqual(previousLearningStep(course, next), attempt)
  assert.deepEqual(restoreLearningAttempt(JSON.stringify(next), course), next)
})

test('sequential course finishes after the last practice and sends skipped questions to the full test', () => {
  let attempt = freshLearningAttempt(course)
  for (const lesson of course.lessons) {
    assert.equal(attempt.lessonId, lesson.id)
    assert.equal(attempt.view, 'theory')
    attempt = nextLearningStep(course, attempt)
    for (const q of lesson.questions) {attempt.answers[q.id] = q.kind === 'choice' ? String(q.correct) : q.answers[0];attempt=checkLearningAnswer(course,attempt,q.id)}
    attempt = nextLearningStep(course, attempt)
  }
  assert.equal(attempt.finished, true)
  assert.equal(learningScore(course, attempt).percent, 100)
  assert.equal(nextLearningStep(course, attempt), attempt)
  const last = course.lessons.at(-1)
  let skipped = { ...freshLearningAttempt(course), lessonId:last.id, view:'practice', answers:{} }
  for (const q of last.questions) {skipped.answers[q.id] = q.kind === 'choice' ? '0' : 'example';skipped=checkLearningAnswer(course,skipped,q.id)}
  assert.equal(nextLearningStep(course, skipped).view, 'all')
  assert.equal(nextLearningStep(course, skipped).finished, false)
})
test('sources 01 and 02 form a combined language and OOP course with both task types', () => {
  assert.equal(course.lessons.length, 20)
  assert.equal(course.lessons.flatMap(l => l.questions).length, 40)
  assert.ok(course.lessons.flatMap(l => l.questions).filter(q => q.kind === 'output').length >= 8)
  assert.ok(course.lessons.some(l => l.source.startsWith('02_') && l.id === 'events'))
  const invalid = structuredClone(course)
  invalid.lessons[0].questions[0].correct = 4
  assert.throws(() => validateLearningCourse(invalid))
  invalid.lessons[0].questions[0].correct = 0
  invalid.lessons[1].questions[0].id = invalid.lessons[0].questions[0].id
  assert.throws(() => validateLearningCourse(invalid))
})
test('all answers can finish the test from the first block and receive a complete score', () => {
  const attempt = freshLearningAttempt(course)
  assert.throws(() => finishLearningAttempt(course, attempt))
  for (const q of course.lessons.flatMap(l => l.questions)) attempt.answers[q.id] = q.kind === 'choice' ? String(q.correct) : q.answers[0]
  assert.equal(attempt.lessonId, course.lessons[0].id)
  const finished = finishLearningAttempt(course, attempt)
  assert.equal(finished.finished, true)
  assert.deepEqual(learningScore(course, finished), { total: 40, answered: 40, correct: 40, percent: 100, canFinish: true })
})
test('code output accepts line breaks but preserves the case of actual C# output', () => {
  const q = course.lessons.find(l => l.id === 'equality').questions.find(q => q.kind === 'output')
  assert.equal(isLearningCorrect(q, '  True\r\nFalse\n'), true)
  assert.equal(isLearningCorrect(q, 'true false'), false)
  assert.equal(isLearningCorrect(q, ''), false)
})
test('offline progress and finished results survive restart', () => {
  const attempt = freshLearningAttempt(course)
  attempt.answers[course.lessons[0].questions[0].id] = '0'
  assert.deepEqual(restoreLearningAttempt(JSON.stringify(attempt), course), attempt)
  for(const q of course.lessons.flatMap(l=>l.questions))attempt.answers[q.id]=q.kind==='choice' ? String(q.correct) : q.answers[0]
  const finished=finishLearningAttempt(course,attempt)
  assert.deepEqual(restoreLearningAttempt(JSON.stringify(finished),course),finished)
  assert.throws(() => restoreLearningAttempt('{', course))
  const invalidChoice = { ...attempt, answers: { [course.lessons[0].questions[0].id]: '999' } }
  assert.deepEqual(restoreLearningAttempt(JSON.stringify(invalidChoice), course).answers, {})
})
test('expanded catalog preserves original IDs and cannot be downgraded by an older feed', () => {
  assert.equal(catalog.topics.length, 28)
  assert.equal(catalog.topics.reduce((sum,t) => sum+t.questions.length,0), 738)
  assert.equal(catalog.topics[0].questions[0].id, 'csharp-001')
  const old = { topics: catalog.topics.slice(0,8) }
  assert.equal(newerCatalog(catalog, old), catalog)
  assert.equal(newerCatalog(catalog, { ...old, revision: 5 }).revision, 5)
})
