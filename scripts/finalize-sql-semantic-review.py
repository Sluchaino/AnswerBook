"""Accept the complete reading ledger and package corrected course sources."""
from pathlib import Path
import collections
import csv
import hashlib
import json
import re
import shutil
import zipfile

workspace=Path(__file__).resolve().parents[1]
root=workspace/'artifacts/sql-course-semantic-reviewed-2026-11-04/sql-course'
source=workspace/'artifacts/sql-course-answerbook-revised-2026-11-04/sql-course'
evidence=root/'verification'
load=lambda p:json.loads(p.read_text(encoding='utf8'))
dump=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
ledger=load(evidence/'semantic-review-ledger.json')
summary=load(evidence/'semantic-summary.json')
bank=load(evidence/'semantic-question-bank.json')
original=load(workspace/'artifacts/sql-semantic-questions.json')
audit=load(workspace/'artifacts/sql-course-semantic-audit.json')
runtime=load(workspace/'artifacts/sql-semantic-runtime/results.json')
exercises=load(workspace/'artifacts/sql-revised-exercise-validation.json')
assert len(ledger)==len(bank)==1041 and len({r['id'] for r in ledger})==1041
assert {r['id'] for r in original}=={r['id'] for r in ledger}
assert all(r['checks']==['condition','four-options','unique-best-answer','answer-key','available-explanations'] for r in ledger)
assert not audit['structuralProblems'] and not audit['duplicateQuestionIds']
assert audit['totals']['questions']==audit['totals']['keys']==1041
assert runtime['clusterStopped'] and len(runtime['records'])==36 and all(r['passed'] for r in runtime['records'])
assert exercises['passed'] and exercises['exercises']==97 and exercises['assertions']==777
for row in ledger:
    assert (row['beforeSha256']==row['afterSha256']) == (row['status']=='reviewed-unchanged'),row['id']
lookup={q['id']:q for q in bank}
assert lookup['sql-foundations-m13-l01-q01']['answer']=='A'
assert 'необязателен' in lookup['sql-foundations-m06-l01-q05']['rationale'] or 'разрешено опускать' in lookup['sql-foundations-m06-l01-q05']['rationale']
assert 'Подзапрос в FROM называется производной таблицей (derived table). В PostgreSQL ему нужно задать псевдоним.' not in (root/'modules/module-06/01_subquery_basics.md').read_text(encoding='utf8')
assert len({tuple(q['choices'].keys()) for q in bank})==1
assert all(len(q['choices'])==4 and q['answer'] not in q['wrongs'] for q in bank)
assert all('explanation' not in q for q in bank)
assert all(len(lookup[f'sql-foundations-m11-{suffix}']['wrongs'])==3 for suffix in [q['id'].split('m11-')[1] for q in bank if '-m11-' in q['id']])

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
unchanged_files=['interactive_contracts.json']+[p.relative_to(source).as_posix() for p in source.glob('modules/*/examples/*.sql')]
assert len(unchanged_files)==29
assert all(sha(source/rel)==sha(root/rel) for rel in unchanged_files)
for mod in load(root/'course_manifest.json')['modules']:
    assert sha(source/mod['interactiveSpecsFile'])==sha(root/mod['interactiveSpecsFile'])
    assert sha(source/mod['interactiveBriefsFile'])==sha(root/mod['interactiveBriefsFile'])
    p=root/mod['directory']/'check_report.md'
    p.write_text(p.read_text(encoding='utf8')+'\nПредметная вычитка всех вопросов модуля завершена; результаты и индивидуальный журнал questionId: SEMANTIC_REVIEW_2026-11-04.md и verification/semantic-review-ledger.json в корне курса.\n',encoding='utf8')

originalmap={r['id']:r for r in original}
changes={'questionText':sum(q['question']!=originalmap[q['id']]['question'] for q in bank),
         'optionText':sum(q['choices']!=originalmap[q['id']]['choices'] for q in bank),
         'answerLetter':sum(q['answer']!=originalmap[q['id']]['answer'] for q in bank)}
counts=collections.Counter(q['status'] for q in ledger)
assert counts['corrected']==summary['questionsEdited']
with (evidence/'semantic-review.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.writer(f,delimiter=';');writer.writerow(['questionId','Статус','Ответ','Вопрос','Исправления'])
    for row in ledger:writer.writerow([row['id'],'Исправлен' if row['status']=='corrected' else 'Проверен',row['answer'],lookup[row['id']]['question'],' | '.join(row['findings'])])
portable={**audit,'root':'sql-course'}
dump(evidence/'structure.json',portable)
dump(evidence/'exercise-validation.json',exercises)
invariants=evidence/'invariants.json'
shutil.copyfile(invariants,evidence/'structural-stage-invariants.json')
dump(invariants,{'questionIdsPreserved':1041,'reviewedIndividually':1041,'questionsEdited':counts['corrected'],'remainingWithoutEdits':counts['reviewed-unchanged'],
 'answerLetterChanges':summary['keyChanges'],'sqlFilesPreservedByteForByte':28,'interactiveObjectsPreservedByteForByte':97,'structuralProblems':0,'passed':True})
runtime_copy=evidence/'semantic-runtime';runtime_copy.mkdir(exist_ok=True)
for p in (workspace/'artifacts/sql-semantic-runtime').iterdir():
    if p.is_file():shutil.copyfile(p,runtime_copy/p.name)
table='\n'.join(f'| {i:02} | {n} | {sum(q["status"]=="corrected" and q["moduleId"]==f"sql-foundations-m{i:02}" for q in ledger)} |' for i,n in enumerate([55,81,67,60,74,74,62,69,62,55,69,69,62,55,55,72],1))
sources=[
('FROM-подзапросы и группировка','https://www.postgresql.org/docs/18/queries-table-expressions.html'),
('Изменение псевдонимов с PostgreSQL 16','https://www.postgresql.org/docs/16/release-16.html'),
('Ограничения и индексы FK','https://www.postgresql.org/docs/18/ddl-constraints.html'),
('Скалярный и строковый IN','https://www.postgresql.org/docs/18/functions-subquery.html'),
('Средние rows/time и loops','https://www.postgresql.org/docs/18/using-explain.html'),
('CURRENT_TIMESTAMP и время транзакции','https://www.postgresql.org/docs/18/functions-datetime.html'),
('VIEW и CHECK OPTION','https://www.postgresql.org/docs/18/sql-createview.html'),
('Безопасный SECURITY DEFINER','https://www.postgresql.org/docs/18/sql-createfunction.html'),
('Несколько команд в simple-query protocol','https://www.postgresql.org/docs/18/protocol-flow.html'),
]
report=f'''# Предметная вычитка всех 1041 вопросов SQL

Дата: 4 ноября 2026 г. Курс: sql-foundations. Целевая версия: PostgreSQL 18.

Проверены все **1041 вопрос в 16 модулях**: условия, четыре варианта, выбор единственного наилучшего ответа, ключи и имеющиеся пояснения. Это предметное чтение ассистентом каждого вопроса, а не вывод о смысле из одного структурного скрипта. Отдельно просмотрены подробные разборы дистракторов; повторяющиеся одинаковые шаблоны сверялись с фактическими вариантами, а у оконных функций заменены адресными текстами.

## Результат

- Исправления или уточнения внесены в **{counts['corrected']} вопроса**; **{counts['reviewed-unchanged']} вопросов** оставлены без содержательных изменений.
- У {changes['questionText']} вопросов изменён текст условия, у {changes['optionText']} — текст вариантов. Эти группы пересекаются. Остальные правки относятся к ключу или объяснениям; {counts['corrected']} не означает столько же неверных ключей.
- Один дополнительный неверный ключ изменён: **m13-l01-q01, B → A**. Представление читается через SELECT ... FROM, не CALL. Две ошибки AS и SELECT * из предыдущей ревизии уже были исправлены и повторно проверены.
- Неоднозначные варианты в m09-exam-q12 (lossless join), m15-l03-q03 (GRANT INSERT) и постановка m08-exam-q09 исправлены так, чтобы ответ был однозначным.
- Уточнены псевдонимы FROM в PostgreSQL 18, функциональная зависимость при GROUP BY, скалярный и строковый IN, создание индексов FK, NULL, транзакционные снимки, autocommit, рамки окон и время текущей транзакции.
- В вопросы с количеством строк и конкретными покупателями встроены исходные данные: результат больше не зависит от изменения учебной ShopDB.
- Переписаны разборы всех 69 вопросов модуля оконных функций: устранены чужие объяснения LAG рядом с SUM, исправлен псевдосинтаксис рамок и явно задан порядок ранжирования.
- В отрицательных вопросах устранены пояснения, ошибочно объявлявшие истинное свойство ACID/SAVEPOINT/индекса ложным. Исправлены смещённые разборы в модулях 6, 7, 8, 9, 15, 16.
- Соседняя теория уточнена там, где иначе она противоречила бы исправленным ответам, включая обязательность псевдонима и форму IN.

## Охват по модулям

| Модуль | Проверено вопросов | С правками |
|---|---:|---:|
{table}

## Проверка выполнения

На {runtime['postgresVersion']} выполнены **36 независимых runtime-проверок**, все прошли. Среди них: FROM без псевдонима; row-value IN; разрешённая функциональная зависимость GROUP BY и ошибка без неё; существующий целевой ключ FK и отсутствие автоматически созданного дочернего индекса; GRANT INSERT без CREATE/передачи владельца; чтение VIEW; LIKE с подчёркиванием; контрпример второго верного ответа lossless join; NULL и ноль в агрегатах; пустой/многострочный скалярный подзапрос; составной UNIQUE с NULL; RANK/DENSE_RANK; NTILE; рамки ROWS/GROUPS и LAST_VALUE; завершение рекурсивного UNION; время транзакции; COMMIT в aborted; ON COMMIT DROP; CHECK с NULL; SAVEPOINT; цепочка LEFT JOIN; EXISTS без размножения платежей; безопасный search_path; полуоткрытый диапазон даты; actual rows × loops. Кластер остановлен после проверки.

Структурный аудит повторён: **1041 уникальных questionId, 1041 ключ, 0 структурных ошибок**. Все идентификаторы сохранены. Выполнено **777 проверок решений 97 интерактивов** настоящим валидатором AnswerBook. Объекты интерактивов и все 28 практических SQL-файлов побайтово совпадают с ранее проверенной ревизией; старые runtime-логи сохранены, их повторный запуск не подменяется утверждением о новом тесте.

## Журнал каждого вопроса

- `verification/semantic-review-ledger.json`: все 1041 questionId, статус, проверенные аспекты, причины правок, сопоставимые хеши до/после.
- `verification/semantic-review.csv`: тот же список для просмотра в таблице.
- `verification/semantic-question-bank.json`: проверенные условия, варианты, ключ и пояснения; старый текст ключа не дублируется в поле explanation.
- `verification/semantic-summary.json`: конкретные правки по ID.
- `verification/semantic-runtime/`: SQL-файлы, логи и результаты 36 проверок.

## Документация для спорных правил

'''+ '\n'.join(f'- [{title}]({url})' for title,url in sources)+'''

Исходная папка Downloads и предыдущий архив сохранены. Это проверенный авторский комплект; полный импорт теории/вопросов в формат курса AnswerBook и публикация в хранилище остаются отдельным действием. Установка pgAudit и аппаратная проверка телефона в эту предметную вычитку не входили.
'''
(root/'SEMANTIC_REVIEW_2026-11-04.md').write_text(report,encoding='utf8')
oldreport=root/'REVISION_AUDIT_2026-11-04.md'
(evidence/'structural-stage-report.md').write_text('Исторический отчёт предыдущего этапа, до завершения предметной вычитки. Текущий результат — SEMANTIC_REVIEW_2026-11-04.md.\n\n'+oldreport.read_text(encoding='utf8'),encoding='utf8')
oldreport.write_text(report,encoding='utf8')
(workspace/'docs/sql-course-semantic-review-2026-11-04.md').write_text(report,encoding='utf8')
(root/'README.md').write_text('# SQL: проверенная ревизия AnswerBook\n\nPostgreSQL 18. 16 модулей, 98 уроков, 1041 вопрос и 97 интерактивов.\n\nПредметная вычитка всех вопросов завершена 4 ноября 2026 г. Итог: SEMANTIC_REVIEW_2026-11-04.md. Индивидуальный журнал: verification/semantic-review.csv.\n\nНачинайте с course_manifest.json. Учебные файлы и ключи разделены. interactive_contracts.json содержит 97 совместимых объектов упражнений с lessonId; это ещё не опубликованный JSON всего курса.\n',encoding='utf8')
(root/'progress.md').write_text('# Статус\n\nЗавершена предметная вычитка всех 1041 вопросов, исправлены ключи, условия, варианты и пояснения. Выполнены 36 runtime-проверок спорных случаев. Следующий этап — импорт полного курса в AnswerBook. См. SEMANTIC_REVIEW_2026-11-04.md.\n',encoding='utf8')

archive=workspace/'artifacts/sql-course-semantic-reviewed-2026-11-04.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file():z.write(p,'sql-course/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(json.loads(z.read('sql-course/verification/semantic-review-ledger.json')))==1041
dump(archive.with_suffix('.zip.json'),{'filename':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive),'questions':1041,'questionsEdited':counts['corrected'],'runtimeCases':36})
print(archive)
print('Verified ZIP bytes:',archive.stat().st_size)
