import {readFileSync,writeFileSync} from 'node:fs'
import {validateCatalog} from '../src/lib/catalog.ts'
import {questionRedirects} from '../src/lib/questionRedirects.ts'

const path=new URL('../src/data/questions.json',import.meta.url)
const catalog=validateCatalog(JSON.parse(readFileSync(path,'utf8')))
const questions=new Map(catalog.topics.flatMap(t=>t.questions.map(q=>[q.id,q])))
const wording={
  'csharp-007':'Что такое Nullable<T> и как безопасно получить его значение или значение по умолчанию?',
  'csharp-pdf1-28-7':'Что такое кортежи в C# и как обращаться к именованным элементам?',
  'csharp-020':'Что такое делегат и как его объявить в C#?',
  'dotnet-memory-pdf3-16-3':'Когда нужен собственный тип исключения и какие дополнительные данные он может содержать?',
  'algorithms-008':'Как выбрать сортировку с учётом размера данных, памяти, устойчивости и требуемой сложности?',
  'algorithms-019':'Как найти все повторяющиеся значения в int[] за ожидаемое O(n), не меняя массив? Разрешена дополнительная память O(n).',
  'open-algorithms-data-structures-dp-greedy-2':'На лестницу из n ступеней можно подниматься на 1 или 2 ступени. Как посчитать число способов с помощью ДП? Задайте состояние, переход и базовые случаи.',
}
for(const [id,text] of Object.entries(wording)){
  const question=questions.get(id)
  if(!question)throw Error('Не найден вопрос '+id)
  question.text=text
}
const additions=[
  ['csharp','csharp-tuples-deconstruction','Как работает деконструкция кортежей и пользовательских типов в C#?'],
  ['oop-design','oop-csharp-explicit-interface','Как объявить и использовать явную реализацию интерфейса в C#?'],
  ['oop-design','oop-csharp-interface-conflict','Как реализовать два интерфейса с одинаковой сигнатурой метода, но разным поведением?'],
  ['oop-design','oop-csharp-default-interface','Как работают реализации методов интерфейса по умолчанию и когда они доступны?'],
  ['oop-design','oop-csharp-multiple-inheritance','Какие ограничения есть у множественного наследования классов и реализации интерфейсов в C#?'],
  ['oop-design','oop-csharp-constructor-order','В каком порядке выполняются конструкторы базового и производного классов?'],
  ['oop-design','oop-csharp-virtual-constructor','Почему вызов виртуального метода из конструктора может нарушить корректность объекта?'],
  ['oop-design','oop-csharp-base-call','Как из переопределённого метода вызвать реализацию базового класса и зачем это бывает нужно?'],
  ['oop-design','oop-csharp-immutable-class','Как спроектировать неизменяемый класс и защитить его от изменения через вложенные объекты?'],
  ['oop-design','oop-csharp-collection-encapsulation','Почему возврат изменяемой коллекции из свойства может нарушить инкапсуляцию?'],
  ['oop-design','oop-csharp-aggregation','Чем агрегация отличается от композиции по времени жизни и владению объектами?'],
  ['oop-design','oop-csharp-construction-access','Как ограничить создание экземпляров класса с помощью конструкторов и модификаторов доступа?'],
  ['oop-design','oop-csharp-fluent-api','Как реализовать fluent API с возвратом текущего объекта через this?'],
  ['oop-design','oop-csharp-tostring','Как переопределить ToString() и что включать в строковое представление объекта?'],
  ['oop-design','oop-csharp-contract','Чем публичный контракт класса отличается от деталей его реализации?'],
]
for(const [topicId,id,text] of additions){
  if(questionRedirects[id])throw Error('ID ранее удалён: '+id)
  if(questions.has(id))continue
  catalog.topics.find(t=>t.id===topicId).questions.push({id,text})
}
catalog.revision=Math.max(catalog.revision??0,10)
validateCatalog(catalog)
const texts=new Set()
for(const q of catalog.topics.flatMap(t=>t.questions)){
  if(q.text.length>160)throw Error('Слишком длинный вопрос '+q.id)
  const key=q.text.toLocaleLowerCase('ru').replace(/[\p{P}\p{Z}\s]/gu,'')
  if(texts.has(key))throw Error('Повтор формулировки '+q.id)
  texts.add(key)
}
writeFileSync(path,JSON.stringify(catalog,null,2)+'\n')
console.log(`Каталог v${catalog.revision}: ${texts.size} вопросов; ООП — ${catalog.topics.find(t=>t.id==='oop-design').questions.length}.`)
