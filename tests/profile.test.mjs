import test from 'node:test'
import assert from 'node:assert/strict'
import { courseProgress, emptyProfile, parseProfile, toggleCompleted } from '../src/lib/profile.ts'

const course = { id: 'learning:csharp', title: 'C#: язык и объектная модель', learningCourseId: 'csharp' }
const custom = { id: 'custom:book', title: 'Прочитать книгу' }
function fixture() {
  return { ...emptyProfile(), name: 'Анна', professions: [
    { id: 'backend', title: 'Backend-разработчик', courses: [course, custom] },
    { id: 'unity', title: 'Unity-разработчик', courses: [course] },
  ] }
}

test('profile, professions, custom courses and completion survive an offline reload', () => {
  const profile = toggleCompleted(fixture(), course.id)
  assert.deepEqual(parseProfile(JSON.stringify(profile)), profile)
  assert.deepEqual(parseProfile(null), emptyProfile())
})
test('a course shared by two professions has one completion state and is counted once', () => {
  const profile = toggleCompleted(fixture(), course.id)
  assert.equal(courseProgress(profile.professions[0].courses, profile.completedCourseIds).percent, 50)
  assert.equal(courseProgress(profile.professions[1].courses, profile.completedCourseIds).percent, 100)
  assert.deepEqual(courseProgress(profile.professions.flatMap(p => p.courses), profile.completedCourseIds), { total: 2, done: 1, percent: 50 })
  assert.deepEqual(toggleCompleted(profile, course.id).completedCourseIds, [])
  assert.equal(toggleCompleted(profile, 'unknown'), profile)
})
test('removing one profession preserves another profession and its completion', () => {
  const profile = toggleCompleted(fixture(), course.id)
  profile.professions = profile.professions.filter(p => p.id !== 'backend')
  const restored = parseProfile(JSON.stringify(profile))
  assert.equal(courseProgress(restored.professions[0].courses, restored.completedCourseIds).percent, 100)
})
test('invalid saved data is reported rather than silently reset', () => {
  for (const raw of ['{', 'null', '{}', JSON.stringify({ ...fixture(), version: 2 }), JSON.stringify({ ...fixture(), completedCourseIds: [1] })]) assert.throws(() => parseProfile(raw))
  const duplicate = fixture()
  duplicate.professions[0].courses.push(course)
  assert.throws(() => parseProfile(JSON.stringify(duplicate)))
  assert.deepEqual(courseProgress([], []), { total: 0, done: 0, percent: 0 })
})

test('profession percentages use completed courses and round to hundredths', () => {
  const third = { id:'custom:third', title:'Third' }
  assert.deepEqual(courseProgress([course, custom, third], [course.id]), {total:3,done:1,percent:33.33})
  assert.equal(courseProgress([course, custom, third], [course.id, custom.id]).percent, 66.67)
  assert.equal(courseProgress([course], []).percent, 0)
  assert.equal(courseProgress([course], [course.id]).percent, 100)
})

test('old survey topics and known-question data cannot contribute to profession progress', () => {
  const legacy = {id:'topic:csharp',title:'Old topic',topicId:'csharp'}
  assert.deepEqual(courseProgress([legacy], [legacy.id]), {total:0,done:0,percent:0})
  assert.deepEqual(courseProgress([legacy,course,custom], [legacy.id,custom.id]), {total:2,done:1,percent:50})
  const topics = [{id:'csharp',questions:[{id:'q1'},{id:'q2'}]}]
  assert.deepEqual(courseProgress([course], [], topics, ['q1','q2'], {csharp:['csharp']}), {total:1,done:0,percent:0})
})
