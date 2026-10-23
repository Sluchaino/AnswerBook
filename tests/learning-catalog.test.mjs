import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkLearningAnswer, validateLearningCourse, freshLearningAttempt, nextLearningStep, learningScore, learningStorageKey, openLearningAttempt, restoreLearningAttempt } from '../src/lib/learning.ts'
import { courseProgress } from '../src/lib/profile.ts'

const read = name => JSON.parse(readFileSync(new URL('../src/data/' + name, import.meta.url), 'utf8'))
const catalog = read('learning-catalog.json')
const courses = catalog.map(entry => validateLearningCourse(read(entry.file)))

test('fifteen original courses and their direction mapping are preserved', () => {
  const original=catalog.slice(0,15),originalCourses=courses.slice(0,15)
  assert.equal(original.length, 15)
  assert.equal(new Set(original.map(c => c.id)).size, 15)
  const directions = read('learning-directions.json').slice(0,5)
  assert.deepEqual(directions.map(d => d.id), ['dotnet','fundamentals','storage','web','messaging'])
  assert.deepEqual(directions.map(d => original.filter(c => c.direction === d.id).length), [5,1,4,4,1])
  assert.deepEqual(original.map(c => c.sources.map(s => Number(s.file.slice(0,2)))), [[1,2],[3],[4],[5],[6],[7],[8],[9],[10],[11],[12],[13],[14],[15],[16]])
  assert.deepEqual(original.map(c => c.scope), ['dotnet','dotnet','dotnet','dotnet','dotnet','universal','universal','universal','dotnet','universal','universal','dotnet','universal','universal','universal'])
  assert.equal(originalCourses.flatMap(c => c.lessons).flatMap(l => l.questions).length, 362)
  for (let i=0; i<originalCourses.length; i++) {
    const course = originalCourses[i], entry = original[i]
    assert.equal(course.id, entry.id)
    assert.ok(course.source.includes(entry.sources[0].file))
    assert.ok(entry.topicIds.length > 0)
    assert.ok(course.lessons.flatMap(l => l.questions).some(q => q.kind === 'output'))
    for (const lesson of course.lessons) {
      assert.ok(lesson.theory.length >= 3)
      assert.ok(lesson.questions.length >= 2)
      const source = entry.sources.find(s => s.file === lesson.source)
      assert.ok(source, `${course.id}/${lesson.id} must reference one of its source PDFs`)
      assert.ok([...lesson.pages.matchAll(/\d+/g)].every(m => Number(m[0]) >= 1 && Number(m[0]) <= source.pages))
    }
  }
})

test('upgrading an edition keeps unchanged answers and a snapshot of removed answers', () => {
  const course = courses[0], question = course.lessons[0].questions[0]
  const previous = { ...freshLearningAttempt(course), courseVersion:1, lessonId:'removed-block', answers:{[question.id]:'1','removed-question':'my answer'} }
  const raw = JSON.stringify(previous)
  const next = restoreLearningAttempt(raw, course)
  assert.equal(next.courseVersion, course.version)
  assert.equal(next.lessonId, course.lessons[0].id)
  assert.deepEqual(next.answers, { [question.id]:'1' })
  assert.equal(next.previousEdition, raw)
  assert.equal(JSON.parse(next.previousEdition).answers['removed-question'], 'my answer')
  assert.deepEqual(restoreLearningAttempt(JSON.stringify(next), course), next)
  assert.equal(learningScore(course, next).canFinish, false)
})

for (const course of courses) test(`theory/practice sequence finishes ${course.id} without skipping a block`, () => {
  let attempt = freshLearningAttempt(course)
  for (const lesson of course.lessons) {
    assert.equal(attempt.lessonId, lesson.id)
    assert.equal(attempt.view, 'theory')
    attempt = nextLearningStep(course, attempt)
    assert.equal(attempt.view, 'practice')
    assert.equal(nextLearningStep(course, attempt), attempt)
    for (const q of lesson.questions) {attempt.answers[q.id] = q.kind === 'choice' ? String(q.correct) : q.answers[0];attempt=checkLearningAnswer(course,attempt,q.id)}
    attempt = nextLearningStep(course, attempt)
  }
  assert.equal(attempt.finished, true)
  assert.equal(learningScore(course, attempt).percent, 100)
})

test('course storage keys are isolated and the first course retains its existing offline key', () => {
  assert.equal(learningStorageKey(courses[0].id), 'answerbook.learning.csharp.v1')
  assert.equal(new Set(courses.map(c => learningStorageKey(c.id))).size, courses.length)
  const stored = new Map()
  for (const course of courses) {
    const attempt = nextLearningStep(course, freshLearningAttempt(course))
    const q = course.lessons[0].questions[0]
    attempt.answers[q.id] = q.kind === 'choice' ? '0' : q.answers[0]
    stored.set(learningStorageKey(course.id), JSON.stringify(attempt))
  }
  for (const course of courses) {
    const raw = stored.get(learningStorageKey(course.id))
    const exam = openLearningAttempt(raw, course, 'exam')
    assert.equal(exam.view, 'all')
    assert.equal(exam.resumeView, 'practice')
    assert.equal(learningScore(course, exam).answered, 1)
    const resumed = openLearningAttempt(JSON.stringify(exam), course, 'learn')
    assert.equal(resumed.view, 'practice')
    assert.deepEqual(resumed.answers, exam.answers)
    assert.deepEqual(restoreLearningAttempt(raw, course).answers, exam.answers)
  }
})

test('profession progress is independent of known survey questions and course answers', () => {
  const c = { id:'learning:one', title:'One', learningCourseId:'one' }
  const topics = [{id:'language',questions:[{id:'a'},{id:'b'},{id:'c'}]}, {id:'oop',questions:[{id:'d'}]}]
  const mapping = { one:['language','oop'] }
  assert.deepEqual(courseProgress([c,c], [], topics, ['a','d'], mapping), {total:1,done:0,percent:0})
  assert.equal(courseProgress([c], [c.id]).percent, 100)
  assert.equal(courseProgress([c], [], topics, ['a','b','c','d'], mapping).done, 0)
  const attempt = openLearningAttempt(null, courses[0], 'learn')
  assert.deepEqual(attempt.answers, {})
})
