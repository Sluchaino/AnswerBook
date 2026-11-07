import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {eligibleIds, beginSession, freshSession, restoreSession} from '../src/lib/session.ts'
import {newerCatalog} from '../src/lib/catalog.ts'

const catalog=JSON.parse(readFileSync(new URL('../src/data/questions.json',import.meta.url),'utf8'))
const all=catalog.topics.flatMap(t=>t.questions)
const byId=id=>all.find(q=>q.id===id).text

test('survey prompts describe the scenario independently of theory or absent answer options',()=>{
 for(const q of all){
  assert.ok(!/Каков обычный относительный порядок двух компонентов|Что верно для|Какая запись недопустима|Какое утверждение о надёжности|(?:код|пример) (?:из теории|выше)|выберите (?:правильный )?вариант/iu.test(q.text),q.id)
  // A standalone binary question, even with a generic explanation request, is insufficient.
  if (/^(?:Можно ли|Гарантирует ли|Запускает ли|Делает ли|Исправит ли|Ограничивает ли|Создаёт ли)/u.test(q.text)) {
   assert.ok(/(?:Как|Почему|Объясните|Опишите|Сравните|какие|как это)/u.test(q.text),q.id)
  }
 }
})

test('reported C# cases remain concise open questions without hidden examples',()=>{
 const field=byId('csharp-011')
 assert.match(field,/const/u);assert.match(field,/readonly/u)
 const overflow=byId('csharp-pdf1-25-4')
 assert.match(overflow,/checked/u);assert.match(overflow,/переполнение/u)
 const attribute=byId('csharp-pdf1-33-12')
 assert.match(attribute,/атрибуты/u);assert.match(attribute,/код реализует/u)
 assert.equal(byId('csharp-pdf1-26-5'),'Что считает string.Length и почему это число может отличаться от количества видимых символов?')
 assert.equal(byId('csharp-pdf1-27-6'),'Чем отличаются прямоугольный и ступенчатый массивы T[,] и T[][]?')
})

test('wording revision supersedes an older feed without deleting known marks or an active answer',()=>{
 const old={...catalog,revision:catalog.revision-1}
 assert.equal(newerCatalog(catalog,old),catalog)
 const id='csharp-011'
 const ids=eligibleIds(catalog.topics,['csharp'],[id],false)
 assert.ok(!ids.includes(id))
 const session=beginSession(freshSession(),catalog.topics,['csharp'],[id])
 session.answers[id]='Моё объяснение'
 const restored=restoreSession(JSON.stringify(session),catalog.topics)
 assert.equal(restored.answers[id],'Моё объяснение')
})
