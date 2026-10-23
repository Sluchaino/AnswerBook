import { readFileSync } from 'node:fs'
import { validateLearningCourse } from '../src/lib/learning.ts'

const { topics } = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'))
const topicIds = new Set()
const questionIds = new Set()
const colors = new Set(['violet', 'blue', 'orange', 'green', 'pink', 'teal'])

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: требуется непустая строка`)
}

if (!Array.isArray(topics) || !topics.length) throw new Error('Добавьте хотя бы одну тему в topics')
for (const topic of topics) {
  for (const field of ['id', 'title', 'description', 'symbol', 'color']) requireText(topic[field], `Тема: ${field}`)
  if (!Number.isInteger(topic.number) || topic.number < 1) throw new Error(`Некорректный номер темы: ${topic.id}`)
  if (topicIds.has(topic.id)) throw new Error(`Повторяется id темы: ${topic.id}`)
  topicIds.add(topic.id)
  if (!colors.has(topic.color)) throw new Error(`Неизвестный цвет: ${topic.color}`)
  if (!Array.isArray(topic.questions) || !topic.questions.length) throw new Error(`Нет вопросов в теме ${topic.id}`)
  for (const question of topic.questions) {
    requireText(question.id, 'Вопрос: id')
    requireText(question.text, 'Вопрос: text')
    if (questionIds.has(question.id)) throw new Error(`Повторяется id вопроса: ${question.id}`)
    questionIds.add(question.id)
  }
}
console.log(`Контент проверен: тем — ${topicIds.size}, вопросов — ${questionIds.size}.`)
const courses = JSON.parse(readFileSync(new URL('../src/data/learning-catalog.json', import.meta.url), 'utf8'))
const directions = JSON.parse(readFileSync(new URL('../src/data/learning-directions.json', import.meta.url), 'utf8'))
const directionIds = new Set()
for (const direction of directions) {
  for (const field of ['id', 'title', 'description']) requireText(direction[field], 'Направление: ' + field)
  if (directionIds.has(direction.id)) throw new Error('Повторяется направление: ' + direction.id)
  directionIds.add(direction.id)
}
const readings=JSON.parse(readFileSync(new URL('../src/data/learning-readings.json',import.meta.url),'utf8'))
const previous=JSON.parse(readFileSync(new URL('../src/data/learning-previous-editions.json',import.meta.url),'utf8'))
const courseIds = new Set()
for (const entry of courses) {
  const course = validateLearningCourse(JSON.parse(readFileSync(new URL('../src/data/' + entry.file, import.meta.url), 'utf8')))
  if (course.id !== entry.id || courseIds.has(course.id)) throw new Error('Некорректный id учебного курса: ' + entry.id)
  if (!Number.isInteger(entry.pageCount) || entry.pageCount < 1 || !Array.isArray(entry.topicIds) || entry.topicIds.some(id => !topicIds.has(id))) throw new Error('Некорректные метаданные курса: ' + entry.id)
  if (!directionIds.has(entry.direction) || !['dotnet','universal'].includes(entry.scope) || !colors.has(entry.color)) throw new Error('Некорректное направление курса: ' + entry.id)
  if (!Array.isArray(entry.sources) || !entry.sources.length || entry.sources.some(source => typeof source.file !== 'string' || !source.file.endsWith('.pdf') || !Number.isInteger(source.pages) || source.pages < 1) || new Set(entry.sources.map(s => s.file)).size !== entry.sources.length || entry.sources.reduce((sum,s) => sum + s.pages, 0) !== entry.pageCount) throw new Error('Некорректные источники: ' + entry.id)
  for (const lesson of course.lessons) {
    const sections=readings[course.id]?.[lesson.id]
    if(!Array.isArray(sections) || !sections.length)throw new Error('Нет расширенной теории: '+course.id+'/'+lesson.id)
    for(const section of sections) {
      requireText(section.title,'Раздел теории');requireText(section.pages,'Страницы теории')
      const origin=entry.sources.find(s=>s.file===section.source)
      if(!origin || !Array.isArray(section.content) || !section.content.length || ![...section.pages.matchAll(/\d+/g)].every(m=>Number(m[0])>=1 && Number(m[0])<=origin.pages))throw new Error('Неверный источник теории')
      for(const part of section.content) {if(!['paragraph','heading','code','table'].includes(part.kind))throw new Error('Неверный вид теории');requireText(part.text,'Теория')}
    }
    const source = entry.sources.find(s => s.file === lesson.source)
    const pages = [...lesson.pages.matchAll(/\d+/g)].map(m => Number(m[0]))
    if (!source || !pages.length || pages.some(page => page < 1 || page > source.pages)) throw new Error('Некорректные страницы источника: ' + course.id + '/' + lesson.id)
  }
  const prior=previous.find(c=>c.id===course.id)
  if(prior) {
  const old=validateLearningCourse(prior)
  if(old.version>=course.version)throw new Error('Не увеличена редакция курса')
  const ids=new Set(old.lessons.flatMap(l=>l.questions.filter(q=>q.kind==='choice').map(q=>q.id)))
  if(course.lessons.some(l=>l.questions.some(q=>q.kind==='choice' && ids.has(q.id))))throw new Error('Изменённые варианты должны иметь новые ID')
  } else if(course.version!==1)throw new Error('Для новой редакции требуется предыдущая версия: '+course.id)
  courseIds.add(course.id)
  console.log('Курс: ' + course.title + ' — блоков: ' + course.lessons.length + ', заданий: ' + course.lessons.flatMap(lesson => lesson.questions).length)
}
