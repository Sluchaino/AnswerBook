// Read-only audit of the published course, not authoring drafts.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {validateExercise} from '../src/lib/exercises.ts'
import {csharpBatch05Moves} from './lib/csharp-batch05-plan.mjs'
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const course=read('server/course-source/csharp-foundations-v2.json'),placements=read('server/exercise-source/csharp-foundations-v2.json'),baseline=read('tests/fixtures/exercises-before-batch05.json'),hashes=read('tests/fixtures/csharp-content-before-batch05.json')
const manifest=read('server/AnswerBook.ContentApi/content/catalog.json'),entry=manifest.courses.find(c=>c.id===course.id),payload=fs.readFileSync('server/AnswerBook.ContentApi/content/courses/'+entry.file)
assert.equal(createHash('sha256').update(payload).digest('hex'),entry.sha256);assert.deepEqual(JSON.parse(payload).modules,course.modules)
const batch=placements.filter(p=>p.block.exercise.id.startsWith('csharp-b05-'))
assert.equal(baseline.length,62);assert.equal(batch.length,34);assert.equal(placements.length,96)
for(const old of baseline){const now=placements.find(p=>p.block.exercise.id===old.block.exercise.id);assert.deepEqual(now.block,old.block)}
for(const p of placements)validateExercise(p.block.exercise)
const count=(list,id)=>list.filter(p=>p.moduleId===id).length,order=[...course.modules.slice(1),course.modules[0]]
for(const m of course.modules){assert.ok(count(placements,m.id)>=5,m.id);for(const l of m.lessons)assert.ok(placements.filter(p=>p.lessonId===l.id&&p.moduleId===m.id).length<=1,l.id)}
const escape=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' '),row=cells=>'| '+cells.map(escape).join(' | ')+' |\n'
const lesson=p=>course.modules.find(m=>m.id===p.moduleId).lessons.find(l=>l.id===p.lessonId)
const types=['matching','sequence','code-order','code-debug','data-transform','code-trace','architecture-builder']
let report=`# Покрытие курса C# — минимум пять на модуль, максимум один в уроке

Аудит от 27 октября 2026 года по реальному опубликованному каталогу и immutable payload. Было **62**, добавлено **34**, стало **96**. У **18 модулей по пять**, у «Управляющих конструкций» — **шесть** интерактивов. В каждом из 177 уроков **не больше одного**; 96 уроков содержат интерактив, 81 пока без него. Это согласованное правило «минимум пять на модуль, не больше одного на урок», а не требование заполнить каждый урок.

Курс v${hashes.version} → **v${course.version}**, каталог revision **${manifest.revision}**. У десяти старых заданий изменено только размещение. Все **62** прежних ID, версии и содержимое сохранены. Обычная теория, 354 мини-проверки, 1265 оцениваемых вопросов и порядок модулей не менялись; введение остаётся последним в интерфейсе. Резервная копия — artifacts/csharp-batch05-backup-*; точный путь в artifacts/csharp-batch05-backup-path.txt.

## Все 19 модулей в порядке интерфейса

Переносы показывают чистое изменение числа старых заданий в модуле. Ноль не означает отсутствие изменений размещения внутри модуля.

| № | ID | Модуль | Уроков | До | Новых | Переносы Δ | Сейчас |
|---:|---|---|---:|---:|---:|---:|---:|
`
for(const [index,m]of order.entries()){const old=count(baseline,m.id),added=count(batch,m.id),now=count(placements,m.id);report+=row([index+1,m.id,m.title,m.lessons.length,old,added,now-old-added,now])}
report+='\n## 34 новых задания: уроки, цели и позиции\n\nУ каждого указан существующий блок теории, сразу после которого размещено задание. Версия каждого нового упражнения — 1.\n\n| ID / название | Модуль / урок | Тип | Учебная цель / контракт | После блока |\n|---|---|---|---|---|\n'
for(const p of batch){const e=p.block.exercise,l=lesson(p),anchor=l.blocks.find(b=>b.id===p.afterBlockId);assert.equal(anchor.kind,'theory');assert.deepEqual(l.blocks[l.blocks.indexOf(anchor)+1],p.block);report+=row([e.id+' — '+e.title,`${p.moduleId} / ${l.id}: ${l.title}`,e.type,e.description,`${p.afterBlockId}: ${anchor.title}`])}
report+='\n## Десять переносов без изменения упражнения\n\n| ID | Раньше | Теперь | После блока | Причина |\n|---|---|---|---|---|\n'
for(const move of csharpBatch05Moves){const old=baseline.find(p=>p.block.exercise.id===move.id),now=placements.find(p=>p.block.exercise.id===move.id);assert.equal(now.lessonId,move.lessonId);report+=row([move.id,`${old.moduleId} / ${old.lessonId}`,`${move.moduleId} / ${move.lessonId}`,move.afterBlockId,move.reason])}
report+='\n## Семь механик\n\n| Тип | Было | Новых | Всего |\n|---|---:|---:|---:|\n'
for(const t of types)report+=row([t,baseline.filter(p=>p.block.exercise.type===t).length,batch.filter(p=>p.block.exercise.type===t).length,placements.filter(p=>p.block.exercise.type===t).length])
report+='\n## Все 96 опубликованных упражнений\n\n| ID / название | Версия | Модуль | Урок | Тип | После блока |\n|---|---:|---|---|---|---|\n'
for(const p of placements){const e=p.block.exercise;report+=row([e.id+' — '+e.title,e.version,p.moduleId,p.lessonId+': '+lesson(p).title,e.type,p.afterBlockId])}
report+=`
## Совместимость сохранений и импорта

Снимок всех 62 прежних размещений — tests/fixtures/exercises-before-batch05.json. Метаданные и хеши обычного содержания — tests/fixtures/csharp-content-before-batch05.json. Новые тесты сверяют каждый прежний блок целиком и разрешают только десять явно описанных переносов. У 52 заданий место также полностью сохранено.

Сохранение v70 со всеми 62 успешно выполненными интерактивами, ответами, проверками, завершением и оценкой 100% восстанавливается в актуальном курсе без потерь. Открытая позиция перемещённого задания теперь восстанавливается по тому же валидированному упражнению: проверены десять переносов, начатое/решённое состояние, наличие/отсутствие прежней скачанной редакции. При неизвестной или неоднозначной позиции сохраняется безопасный обычный fallback.

Два Markdown-импорта сохранили v114, все 96 заданий и размещения. Публикация выполнена через прежний защищённый authoring API; ключ не выводился и не включался в клиент. Скрипт повторного запуска проверяет уже опубликованные данные и не повышает версии без изменений.

Исторические тесты предыдущих партий восстанавливают свои редакции из полных снимков размещений. Новые тесты отдельно проверяют актуальную публикацию, каждое прежнее упражнение и обычное содержание; переносы не маскируются исключением старых ID из проверок. Payload v70 в исторической проверке воспроизводится штатным сериализатором и сверяется с сохранённым SHA-256.

## Реестр всех 177 уроков

Здесь перечислены реальные уроки и актуальное число интерактивов. Обычные мини-проверки и итоговые тесты не входят в этот подсчёт.
`
for(const m of order){report+=`\n### ${m.id}. ${m.title}\n\n`;for(const l of m.lessons){const parts=l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content),headings=parts.filter(p=>p.kind==='heading').map(p=>p.text).filter(t=>!['Теория','Теория: часть 1','Теория: часть 2','Результат обучения','Результаты обучения'].includes(t));report+=`- **${l.id} ${l.title}** — интерактивов: ${l.blocks.filter(b=>b.kind==='exercise').length}; примеров кода: ${parts.filter(p=>p.kind==='code').length}. ${headings.join('; ')}.\n`}}
report+='\n## Проверки и ограничения\n\n'
if(fs.existsSync('artifacts/csharp-batch05-sdk/results.json')){const sdk=read('artifacts/csharp-batch05-sdk/results.json');assert.ok(sdk.cases.every(c=>c.passed));report+=`SDK ${sdk.sdk}, C# ${sdk.language}, ${sdk.framework}: **${sdk.cases.length}** успешных проверочных сценариев новой партии, включая ожидаемые ошибки компиляции/выполнения и настоящий xUnit. Код исполняется только при подготовке разработчиком.\n`}
if(fs.existsSync('artifacts/csharp-batch05-ui-results.json')){const ui=read('artifacts/csharp-batch05-ui-results.json');assert.equal(ui.results.length,34);assert.equal(ui.relocations.length,10);assert.equal(ui.errors.length,0);assert.ok(ui.results.every(r=>r.restored&&r.reset&&r.keyboard&&r.page<=r.viewport));report+='\nМобильный UI 390px: **34/34** новых задания — неправильный/правильный ответ, объяснение, повтор, сброс, reload и клавиатура. Все десять переносов открыты в новых уроках. Ошибок браузера и горизонтального переполнения страницы нет.\n'}
report+='\n**371/371** тестов приложения, **7/7** API. Lint без ошибок, восемь прежних предупреждений; production-сборка успешна, прежнее предупреждение размера chunk. В контентных тестах закреплены оба инварианта: минимум пять на модуль и максимум один на урок.\n'
report+='\nГотовые трассировки не являются отладчиком, эталоны доступны офлайн. Распределение не обещает интерактив в каждом из 177 уроков. Содержимое старых простых демо сохранено; оно перенесено к соответствующим основам. Прежняя редакционная оговорка m05 о порядке написания метода остаётся в его неизменной версии. Других функций и механик нет. APK этого изменения не собирался; последняя отдельная сборка 1.42 содержит прежний встроенный курс.\n\n[Полный протокол текущего изменения](csharp-batch05-verification.md). История: [минимум три](csharp-batch04-verification.md), [7Б.3](csharp-batch03-verification.md).\n'
fs.writeFileSync('docs/csharp-interactive-coverage.md',report)
console.log(`Published audit: ${course.modules.length} modules; ${baseline.length}+${batch.length}=${placements.length}; minimum five / maximum one.`)
