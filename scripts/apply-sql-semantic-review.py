"""Apply the decisions from the complete semantic reading, preserving question IDs."""
from pathlib import Path
import collections
import copy
import hashlib
import json
import re
import shutil

from sql_semantic_changes import CHANGES

workspace=Path(__file__).resolve().parents[1]
source=workspace/'artifacts/sql-course-answerbook-revised-2026-11-04/sql-course'
target=workspace/'artifacts/sql-course-semantic-reviewed-2026-11-04/sql-course'
if target.exists():raise SystemExit('Output exists; inspect before recreating')
rows=json.loads((workspace/'artifacts/sql-semantic-questions.json').read_text(encoding='utf8'))
assert len(rows)==len({r['id'] for r in rows})==1041
assert set(CHANGES)<=set(r['id'] for r in rows)
shutil.copytree(source,target)
manifest=json.loads((target/'course_manifest.json').read_text(encoding='utf8'))

def read(p):return p.read_text(encoding='utf-8-sig')
def write(p,t):p.write_text(t.rstrip()+'\n',encoding='utf8')
def dump(p,v):write(p,json.dumps(v,ensure_ascii=False,indent=2))
def rationale(body):
    body=re.sub(r'^\*\*Правильный ответ:.*?\*\*\s*','',body,flags=re.S)
    body=re.split(r'(?m)^\*\*(?:Почему|Разбор)',body)[0]
    return re.split(r'(?m)^- ',body)[0].strip()
def wrongs(body):
    result={}
    for line in re.findall(r'(?m)^- (.+)',body):
        marked=re.match(r'\*\*([ABCD])[.)](.*?)\*\*\s*[—–-]?\s*(.*)',line)
        if marked:
            result[marked[1]]=marked[3].strip()
        else:
            plain=re.match(r'([ABCD](?:[, и]+[ABCD])*)\s+(.*)',line)
            if plain:
                for letter in re.findall(r'[ABCD]',plain[1]):result[letter]=re.sub(r'^(?:неверен|неверны):?\s*','',plain[2]).strip()
    return result

revised=[];ledger=[]
for old in rows:
    r=copy.deepcopy(old)
    r['rationale']=rationale(old['explanation'])
    r['wrongs']=wrongs(old['explanation'])
    change=CHANGES.get(r['id'])
    if change:
        for field in ('question','answer','rationale'):
            if field in change:r[field]=change[field]
        r['choices'].update(change.get('choices',{}))
        if 'wrongOrdered' in change:
            letters=[k for k in 'ABCD' if k!=r['answer']]
            assert len(change['wrongOrdered'])==3
            r['wrongs']=dict(zip(letters,change['wrongOrdered']))
        r['wrongs'].update(change.get('wrongs',{}))
    r['wrongs'].pop(r['answer'],None)
    assert (r['rationale'] or r['wrongs']) and r['answer'] in r['choices'],r['id']
    assert all(k in 'ABCD' and k!=r['answer'] and v for k,v in r['wrongs'].items())
    r.pop('explanation')  # Do not ship the pre-review key text beside the corrected fields.
    revised.append(r)
    before={'id':old['id'],'question':old['question'],'choices':old['choices'],'answer':old['answer'],
            'rationale':rationale(old['explanation']),'wrongs':wrongs(old['explanation'])}
    before['wrongs'].pop(before['answer'],None)
    assessed={'id':r['id'],'moduleId':r['id'].split('-l')[0].split('-exam')[0],'status':'corrected' if change else 'reviewed-unchanged',
              'checks':['condition','four-options','unique-best-answer','answer-key','available-explanations'],
              'answer':r['answer'],'findings':change['reasons'] if change else [],
              'beforeSha256':hashlib.sha256(json.dumps(before,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),
              'afterSha256':hashlib.sha256(json.dumps({k:r[k] for k in ['id','question','choices','answer','rationale','wrongs']},ensure_ascii=False,sort_keys=True).encode()).hexdigest()}
    ledger.append(assessed)

lookup={r['id']:r for r in revised}
for file in sorted(set(r['file'] for r in revised)):
    p=target/file;text=read(p)
    # Replace only the question and its four choices, not the following theory/check sections.
    parts=list(re.finditer(r'(?m)^questionId:\s*(sql-foundations-[a-z0-9-]+)\s*$',text))
    for match in reversed(parts):
        qid=match[1];r=lookup[qid]
        after=text[match.end():]
        end=re.search(r'(?m)^D[.)]\s+[^\n]*',after)
        assert end,qid
        replacement='\nformat: choice\n\n'+r['question']+'\n\n'+'\n'.join(f'{k}. {v}  ' for k,v in r['choices'].items())+'\n'
        text=text[:match.end()]+replacement+after[end.end():]
    write(p,text)

for mod in manifest['modules']:
    module_rows=[r for r in revised if r['id'].startswith(mod['moduleId']+'-')]
    text=f'# Ключи ответов: {mod["title"]}\n\nmoduleId: {mod["moduleId"]}\n\nПредметная вычитка: 4 ноября 2026 г.; PostgreSQL 18.\n\n'
    for r in module_rows:
        text+=f'### {r["id"]}\n\n**Правильный ответ: {r["answer"]} — «{r["choices"][r["answer"]]}».**\n\n{r["rationale"]}\n'
        if r['wrongs']:
            text+='\n**Разбор остальных вариантов:**\n'+''.join(f'- **{k}. {r["choices"][k]}** — {v}\n' for k,v in sorted(r['wrongs'].items()))
        text+='\n'
    write(target/mod['answerKeyFile'],text)

# Prevent contradictions between corrected questions and nearby theory.
notes={
4:('Группировка и функциональная зависимость','Правило «каждый неагрегированный столбец должен быть в GROUP BY» имеет исключение PostgreSQL: если сгруппирован весь первичный ключ базовой таблицы, можно выбрать функционально зависящие от него её столбцы. Для обычных несгруппированных столбцов без такой зависимости правило сохраняется.'),
6:('FROM-подзапросы и IN в PostgreSQL 18','В PostgreSQL 18 псевдоним FROM-подзапроса необязателен (начиная с PostgreSQL 16), хотя полезен для читаемости и переносимости. Для скалярного x IN (подзапрос) нужен один столбец; форма (a,b) IN (SELECT x,y ...) допускает несколько соответствующих столбцов.'),
8:('Индексы внешних ключей','FOREIGN KEY требует подходящий уже существующий уникальный родительский ключ либо допустимый нечастичный уникальный индекс; сам по себе FK не создаёт родительский уникальный индекс. PRIMARY KEY и UNIQUE создают свои поддерживающие индексы при объявлении. Индекс на дочерних FK-столбцах автоматически не создаётся.'),
12:('Autocommit и состояние транзакции','Утверждения о независимых командах autocommit предполагают, что клиент отправляет каждую отдельно и явный транзакционный блок не открыт. Несколько SQL-команд, отправленные одной строкой simple-query protocol, могут выполняться в одной неявной транзакции. COMMIT в уже aborted блоке завершает его откатом. NOWAIT для SELECT FOR UPDATE относится к конфликтующим блокировкам строк; табличные блокировки могут потребовать ожидания.'),
15:('Безопасный search_path','Для SECURITY DEFINER используют только доверенные схемы и явно ставят pg_temp после них либо полностью квалифицируют имена. Само наличие фиксированного search_path не защищает, если в нём остаётся схема, доступная для записи недоверенным пользователям.'),
}
for number,(heading,body) in notes.items():
    mod=manifest['modules'][number-1]
    # Place the clarification before lesson tests, in the lesson most relevant to it.
    relevant={4:2,6:1,8:5,12:3,15:5}[number]
    lesson=mod['lessons'][relevant-1]
    p=target/lesson['file'];text=read(p)
    marker='## Промежуточная проверка 1'
    assert marker in text,p
    text=text.replace(marker,f'## Уточнение PostgreSQL 18: {heading}\n\n{body}\n\n'+marker,1)
    write(p,text)

text_fixes={
 'modules/module-06/01_subquery_basics.md':{
  'Подзапрос в FROM называется производной таблицей (derived table). В PostgreSQL ему нужно задать псевдоним.':'Подзапрос в FROM называется производной таблицей (derived table). В PostgreSQL 18 псевдоним можно опустить, но обычно его задают для читаемости и переносимости.',
  '5. Забывать псевдоним у подзапроса в FROM.':'5. Считать псевдоним FROM-подзапроса обязательным в PostgreSQL 18 или путать его область видимости.',
  '- Подзапрос в FROM используется как производная таблица и получает псевдоним.':'- Подзапрос в FROM используется как производная таблица и может иметь псевдоним.'},
 'modules/module-06/04_in_not_in_null.md':{
  'Внутренний запрос должен возвращать один столбец, но может возвращать много строк.':'В рассматриваемой скалярной форме внутренний запрос должен возвращать один столбец, но может возвращать много строк. Сравнение строк (a,b) IN (SELECT x,y ...) — другая допустимая форма.',
  '3. Возвращать из подзапроса для IN несколько столбцов.':'3. Возвращать несколько столбцов для скалярного x IN (...), не используя соответствующий конструктор строки слева.',
  '- Подзапрос для IN и NOT IN возвращает один столбец и может вернуть много строк.':'- Для скалярного IN/NOT IN подзапрос возвращает один столбец и может вернуть много строк; для конструктора строки требуется столько же столбцов, сколько компонентов слева.'},
}
for rel,changes in text_fixes.items():
    p=target/rel;text=read(p)
    for before,after in changes.items():
        assert before in text,(rel,before)
        text=text.replace(before,after)
    write(p,text)

dump(target/'verification/semantic-review-ledger.json',ledger)
dump(target/'verification/semantic-question-bank.json',revised)
summary={'questionsReviewed':len(ledger),'modulesReviewed':16,'questionsEdited':len(CHANGES),
 'keyChanges':[{'id':r['id'],'before':next(o['answer'] for o in rows if o['id']==r['id']),'after':r['answer']} for r in revised if next(o['answer'] for o in rows if o['id']==r['id'])!=r['answer']],
 'counts':dict(collections.Counter(r['id'].split('-m')[1][:2] for r in revised)),
 'changes':[{'id':qid,**v} for qid,v in sorted(CHANGES.items())]}
dump(workspace/'artifacts/sql-semantic-review-summary.json',summary)
dump(target/'verification/semantic-summary.json',summary)
print(json.dumps({k:v for k,v in summary.items() if k!='changes'},ensure_ascii=False,indent=2))
