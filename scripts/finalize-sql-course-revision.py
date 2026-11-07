"""Verify invariants, attach evidence and write the deliverable ZIP."""
from pathlib import Path
import collections
import hashlib
import json
import re
import shutil
import zipfile

workspace=Path(__file__).resolve().parents[1]
root=workspace/'artifacts/sql-course-answerbook-revised-2026-11-04/sql-course'
source=Path(json.loads((workspace/'artifacts/sql-course-revision-summary.json').read_text(encoding='utf8'))['source'])
structure=json.loads((workspace/'artifacts/sql-course-revised-audit.json').read_text(encoding='utf8'))
validation=json.loads((workspace/'artifacts/sql-revised-exercise-validation.json').read_text(encoding='utf8'))
runtime=json.loads((workspace/'artifacts/sql-course-runtime-revised-2026-11-04/results.json').read_text(encoding='utf8'))
assert not structure['structuralProblems'] and not structure['duplicateQuestionIds']
assert validation['passed'] and validation['exercises']==97
assert runtime['records'] and all(r['exitCode']==0 for r in runtime['records'])
assert sum(r['label'].endswith('.sql') for r in runtime['records'])==28
manifest=json.loads((root/'course_manifest.json').read_text(encoding='utf8'))
entries=json.loads((root/'interactive_contracts.json').read_text(encoding='utf8'))

def read(p):return p.read_text(encoding='utf-8-sig')
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def questions(base):
    result={}
    m=json.loads(read(base/'course_manifest.json'))
    for mod in m['modules']:
        for p in [base/l['file'] for l in mod['lessons']]+[base/mod['examFile']]:
            blocks=re.split(r'(?m)^questionId:\s*(sql-foundations-[a-z0-9-]+)\s*$',read(p))
            for i in range(1,len(blocks),2):
                choices=dict(re.findall(r'(?m)^([ABCD])[.)]\s+(.+?)\s*$',blocks[i+1]))
                result[blocks[i]]=choices
    return result
old,new=questions(source),questions(root)
assert len(old)==999 and len(new)==1041
assert all(new[q]==v for q,v in old.items()),'Original question options changed unexpectedly'
lessonids=[l['lessonId'] for m in manifest['modules'] for l in m['lessons']]
assert len(lessonids)==len(set(lessonids))==98
slots=collections.Counter(row['lessonId'] for row in entries)
assert set(slots)<=set(lessonids) and max(slots.values())==1
for mod in manifest['modules'][1:6]:
    for lesson in mod['lessons']:
        text=read(root/lesson['file'])
        assert text.index('## Промежуточная проверка 1')<text.index('## Продолжение теории')<text.index('## Промежуточная проверка 2')<text.index('## Итоговый тест'),lesson['lessonId']
        assert text.count('## Промежуточная проверка')==2
sqlfiles=list(source.glob('modules/*/examples/*.sql'))
assert len(sqlfiles)==28
sqlhashes={str(p.relative_to(source)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sqlfiles}
assert all(hashlib.sha256((root/rel).read_bytes()).hexdigest()==sha for rel,sha in sqlhashes.items())

evidence=root/'verification';evidence.mkdir(exist_ok=True)
portable_structure={**structure,'root':'sql-course'}
dump(evidence/'structure.json',portable_structure)
dump(evidence/'exercise-validation.json',validation)
dump(evidence/'sql-source-sha256.json',sqlhashes)
logs=evidence/'runtime-logs';logs.mkdir(exist_ok=True)
portable_runtime=json.loads(json.dumps(runtime))
for record in portable_runtime['records']:
    original=Path(record['log'])
    if not original.is_absolute():original=workspace/original
    assert original.is_file(),original
    shutil.copyfile(original,logs/original.name)
    record['log']='verification/runtime-logs/'+original.name
dump(evidence/'runtime.json',portable_runtime)
dump(evidence/'invariants.json',{'originalQuestionsPreserved':999,'newQuestions':42,'uniqueLessonIds':98,'sqlFilesPreservedByteForByte':28,'lessonsWithChecksInsideTheory':33,'passed':True})
table='\n'.join(f'| {i} | {m["lessons"]} | {len(m["exercises"])} | {m["questions"]} |' for i,m in enumerate(structure['modules'],1))
types='\n'.join(f'- `{kind}`: {count}.' for kind,count in structure['totals']['types'].items())
report=f'''# Ревизия SQL-курса для AnswerBook

Дата: 4 ноября 2026 г. Целевая версия: PostgreSQL 18. Фактическая проверка: {runtime['postgresVersion']}.

## Результат

16 модулей, 98 уроков, 1041 вопрос с ключами и 97 интерактивов. Минимум пять интерактивов на модуль; максимум один в уроке. Единственный урок без интерактива — m08-l04, его теория и тесты сохранены.

| Модуль | Уроков | Интерактивов | Вопросов |
|---|---:|---:|---:|
{table}

## Исправления

- Добавлены шесть содержательных уроков: требования и моделирование, кратность/обязательность, выбор хранения результата, регламент REFRESH, гранулярность финансового отчёта, месячная аналитика. Добавлены 42 вопроса, два промежуточных и пять итоговых на новый урок.
- Удалены m04-ex05, m10-ex06, m14-ex06, m15-ex06. Интерактивы перераспределены по урокам.
- Все 97 интерактивов получили точные объекты текущего контракта AnswerBook: ID элементов, условия, исходные данные, эталоны, альтернативы и обратную связь. В code-debug одна строка и готовые однострочные замены; code-order содержит буквальные фрагменты с определённым разделителем; трассировки — состояния и вопросы перед переходами.
- Неподдерживаемые JOIN, NULL, агрегаты, UPDATE и календарные вычисления не маскируются под data-transform: используются трассировки, сопоставление или сборка кода. Остались два data-transform с поддерживаемыми отбором, сортировкой и проекцией плоских объектов. Поле price присутствует в проекции m02-ex08; альтернативный эквивалентный конвейер не объявлен ошибочным из-за якобы потерянного price.
- В 33 уроках модулей 2–6 теория разделена на части, проверки расположены между теоретическими частями и примерами. Все исходные вопросы и варианты сохранены.
- В модуле 2 переписаны 243 объяснения неправильных вариантов: 168 в уроках и 75 в экзамене. Исправлены две подтверждённые ошибки ключей: m02-l02-q03 → B (AS не переименовывает исходный столбец), m02-l02-q04 → A (звёздочка выбирает столбцы указанного источника). Исправлены сопутствующие смещённые пояснения. Девять прежних текстовых расхождений цитат ключей синхронизированы с вариантами без смены букв.
- Manifest, README, curriculum, progress и отчёты модулей обновлены. Целевая версия закреплена как PostgreSQL 18.
- Четыре прежних исправления сохранены: pgAudit, DDL-сортировка, identity sequence в RLS и разрешённый REFRESH CONCURRENTLY внутри транзакции. Все 28 исходных SQL-файлов сохранены побайтово.

## Семь механик

{types}

## Что проверено фактически

- Структура, ссылки manifest, ID вопросов/ключей, число проверок, количество уроков и распределение интерактивов: ошибок 0. Все 999 прежних questionId и варианты сохранены, добавлены 42 новых.
- 97 объектов проверены настоящим validateExercise из проекта. Выполнено {validation['assertions']} проверок решений: эталоны принимаются, ошибочные сопоставления/порядки/строки/замены/предсказания/направления связей отклоняются. Для независимых GRANT принимаются оба порядка; для подготовки MV — оба допустимых порядка создания индекса и первого заполнения.
- Все 28 практических SQL-файлов выполнены успешно на отдельном локальном кластере PostgreSQL 18.6.
- Выполнены 18 code-order (включая дополнительный допустимый порядок GRANT) и 17 исправленных code-debug. Проверка запуска не означает автоматическое доказательство всех бизнес-требований: для ряда задач дополнительно сравнивались результаты, например 2.5, фильтр COUNT, атомарный перевод, содержимое VIEW и выручка без дублирования платежами.
- Выполнены 12 буквальных SQL-сценариев трассировки; для пяти концептуальных сценариев выполнены отдельные проверки замыкания, 1NF, рекурсивного дерева, арифметики плана и правила RLS. Концептуальные комментарии не выдаются за исполняемую программу.
- Проверены две настоящие сессии: изменение видимости в READ COMMITTED после COMMIT другой сессии и lock_timeout при удерживаемой строковой блокировке.
- Повторно проверены REFRESH CONCURRENTLY внутри BEGIN/ROLLBACK и разрешённая RLS-вставка с генерируемым ID.
- Всего {len(runtime['records'])} записей runtime-проверок, неуспешных 0. Служебные setup/cleanup тоже входят в это число; это не {len(runtime['records'])} отдельных учебных заданий. Кластер после проверок остановлен.

В ходе проверки исправлялись тестовые фикстуры: передача UTF-8 через SQL-файл, переименование схемы, удаление лишнего ALTER и чтение созданного VIEW отдельным SELECT. Итоговый runtime.json содержит результаты повторных проверок. Эти исправления тестового окружения не выдаются за новые ошибки учебных SQL-файлов.

## Ограничения и следующий этап

Это исправленный авторский комплект, а не опубликованный JSON всего курса. interactive_contracts.json уже содержит 97 совместимых объектов упражнений с lessonId, но теория и вопросы пока остаются Markdown. Полный импорт курса в библиотеку, публикация в S3 и проверка интерфейса на телефоне не выполнялись. APK не пересобирался.

Не проводилась независимая полная ручная семантическая вычитка всех 1041 вопросов и всех теоретических утверждений. Структурный аудит не доказывает предметную правильность каждого исходного вопроса. Результаты EXPLAIN и время исполнения на этом синтетическом наборе не гарантируют производительность на других данных. Расширение pgAudit не устанавливалось и его работа не проверялась.

Исходная папка в Downloads не изменялась. Подробные машинные результаты и логи включены в verification/.
'''
(root/'REVISION_AUDIT_2026-11-04.md').write_text(report,encoding='utf8')
(workspace/'docs/sql-course-revised-2026-11-04.md').write_text(report,encoding='utf8')
archive=workspace/'artifacts/sql-course-answerbook-revised-2026-11-04.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file():z.write(p,'sql-course/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert json.loads(z.read('sql-course/course_manifest.json'))['targetVersion']=='PostgreSQL 18'
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
dump(archive.with_suffix('.zip.json'),{'filename':archive.name,'bytes':archive.stat().st_size,'sha256':sha,'files':len(list(root.rglob('*'))),'date':'2026-11-04'})
print(archive)
print('ZIP verified; bytes:',archive.stat().st_size,'SHA256:',sha)
