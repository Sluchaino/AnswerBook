import { readFileSync } from 'node:fs'

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
