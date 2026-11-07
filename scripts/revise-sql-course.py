"""Rebuild a reviewed authoring package without modifying the supplied source folder.

Run: python scripts/revise-sql-course.py SOURCE_DIRECTORY
This creates an authoring kit, not a published AnswerBook course catalogue entry.
"""
import collections
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

from sql_revision_exercises import build
from sql_revision_lessons import LESSONS
from sql_revision_feedback import FEEDBACK

workspace=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]).resolve()
destination=workspace/'artifacts/sql-course-answerbook-revised-2026-11-04/sql-course'
if destination.exists():
    raise SystemExit('Output exists. Inspect it before selecting another output or removing it.')
if not (source/'course_manifest.json').is_file(): raise SystemExit('Source manifest missing')
shutil.copytree(source,destination)

def read(p): return p.read_text(encoding='utf-8-sig')
def write(p,t): p.write_text(t.rstrip()+'\n',encoding='utf-8')
def dump(p,v): write(p,json.dumps(v,ensure_ascii=False,indent=2))

manifest=json.loads(read(destination/'course_manifest.json'))
manifest['targetVersion']='PostgreSQL 18'
exercises=build()

for m,l,filename,title,first,second,questions in LESSONS:
    module=manifest['modules'][m-1]
    lid=f'sql-foundations-m{m:02}-l{l:02}'
    def question(i):
        q,correct,wrongs,reason=questions[i]
        options=list(wrongs)
        correct_index=(m+l+i)%4
        options.insert(correct_index,correct)
        suffix=f'c{i+1:02}' if i<2 else f'q{i-1:02}'
        qid=lid+'-'+suffix
        block=f'questionId: {qid}\nformat: choice\n\n**Вопрос:** {q}\n\n'+'\n'.join(f'{letter}. {option}  ' for letter,option in zip('ABCD',options))+'\n'
        key=f'\n### {qid}\n\n**Правильный ответ: {"ABCD"[correct_index]} — «{correct}».**\n\n{reason}\n'
        for letter,option in zip('ABCD',options):
            if option!=correct:
                key+=f'\n- **{letter}. {option}** — {reason} Сравните это правило с утверждением «{option}».\n'
        return block,key
    qs=[question(i) for i in range(7)]
    text=f'# {title}\n\nlessonId: {lid}\nmoduleId: {module["moduleId"]}\n\n## Цель\n\nРазобрать {title.lower()} и применить правила на конкретных сценариях.\n\n## Теория\n\n{first}\n\n## Промежуточная проверка 1\n\n{qs[0][0]}\n## Продолжение теории\n\n{second}\n\n## Промежуточная проверка 2\n\n{qs[1][0]}\n## Итоги\n\n{questions[0][3]} {questions[1][3]}\n\n## Итоговый тест\n\n'+ '\n'.join(q[0] for q in qs[2:])
    rel=module['directory']+'/'+filename
    write(destination/rel,text)
    module['lessons'].append({'lessonId':lid,'title':title,'file':rel})
    keyfile=destination/module['answerKeyFile']
    write(keyfile,read(keyfile)+'\n## Дополнительный урок '+str(l)+'\n'+''.join(q[1] for q in qs))

# Two proven semantic key errors, not merely typographical mismatches.
keyfile=destination/'modules/module-02/answer_key.md'
text=read(keyfile)
for suffix,letter in [('l02-q03','B'),('l02-q04','A')]:
    lesson=manifest['modules'][1]['lessons'][1]
    raw=read(destination/lesson['file'])
    qblock=re.split(r'(?m)^questionId: sql-foundations-m02-'+suffix+r'\s*$',raw)[1].split('questionId:')[0]
    choices=dict(re.findall(r'(?m)^([ABCD])\. (.+?)\s*$',qblock))
    pattern=r'(?ms)(^### sql-foundations-m02-'+suffix+r'\s*\n)(.*?)(?=^### |^## |\Z)'
    def fix(match):
        return match[1]+f'**Правильный ответ: {letter} — «{choices[letter]}».**\n\n'+''.join(f'\n- **{k}. {v}** — пояснение будет обновлено.\n' for k,v in choices.items() if k!=letter)+'\n'
    text=re.sub(pattern,fix,text)

# Replace every lesson/exam feedback block in module 2 with per-question explanations.
count_feedback=0
def feedback_block(match):
    global count_feedback
    header, suffix, body=match[1],match[2],match[3]
    rationale, wrongs=FEEDBACK[suffix]
    answer=re.search(r'\*\*Правильный ответ:.*?\*\*',body).group()
    alternatives=re.findall(r'(?m)^- \*\*(.+?)\*\*[^\n]*',body)
    assert len(alternatives)==3,(suffix,alternatives)
    count_feedback+=3
    return header+answer+'\n\n'+rationale+'\n\n'+'\n'.join(f'- **{opt}** — {why}' for opt,why in zip(alternatives,wrongs))+'\n\n'
text=re.sub(r'(?ms)(^### sql-foundations-m02-([^\n]+)\n)(.*?)(?=^### |^## |\Z)',feedback_block,text)
assert count_feedback==243,count_feedback
write(keyfile,text)

# Synchronize quoted key text with actual choices (nine original paraphrases).
for mod in manifest['modules']:
    choices={}
    for p in [destination/l['file'] for l in mod['lessons']]+[destination/mod['examFile']]:
        parts=re.split(r'(?m)^questionId:\s*`?(sql-foundations-[a-z0-9-]+)`?\s*$',read(p))
        for i in range(1,len(parts),2): choices[parts[i]]=dict(re.findall(r'(?m)^([ABCD])[.)]\s+(.+?)\s*$',parts[i+1]))
    p=destination/mod['answerKeyFile']
    def sync(match):
        qid,body=match[2],match[3]
        ans=re.search(r'Правильный ответ:\s*([ABCD])',body)
        if ans and qid in choices:
            body=re.sub(r'(Правильный ответ:\s*[ABCD]\s*[—–-]\s*«).*?(»)',lambda x:x[1]+choices[qid][ans[1]]+x[2],body,count=1,flags=re.S)
        return match[1]+body
    write(p,re.sub(r'(?ms)(^#{2,4}\s+(sql-foundations-[a-z0-9-]+)\s*\n)(.*?)(?=^#{2,4}\s|\Z)',sync,read(p)))

# Move checks into the lesson flow, preserving questions, examples and theory.
repositioned=[]
for mod in manifest['modules'][1:6]:
    for lesson in mod['lessons']:
        p=destination/lesson['file']; text=read(p)
        checks=re.findall(r'(?ms)^## Промежуточная проверка [12]\s*\n.*?(?=^## |\Z)',text)
        assert len(checks)==2,p
        for check in checks: text=text.replace(check,'')
        # Close each first/second worked example, then ask its check.
        examples=list(re.finditer(r'(?m)^#{2,3} Пример [12][^\n]*',text))
        assert len(examples)==2,p
        inserts=[]
        for example,check in zip(examples,checks):
            after=re.search(r'(?m)^#{2,3} ',text[example.end():])
            pos=example.end()+after.start() if after else len(text)
            inserts.append((pos,check+'\n'))
        for pos,check in sorted(inserts,reverse=True): text=text[:pos]+check+text[pos:]
        # The second half of the conceptual material must also follow check 1,
        # rather than leaving every theoretical section before both checks.
        start=re.search(r'(?m)^## Теория\s*\n',text)
        first_example=re.search(r'(?m)^#{2,3} Пример 1[^\n]*',text)
        assert start and first_example,p
        theory=text[start.end():first_example.start()]
        headings=list(re.finditer(r'(?m)^### ',theory))
        assert len(headings)>=2,p
        pivot=headings[max(1,len(headings)//2)].start()
        later=theory[pivot:]
        text=text[:start.end()]+theory[:pivot]+text[first_example.start():]
        second_example=re.search(r'(?m)^#{2,3} Пример 2[^\n]*',text)
        assert second_example,p
        text=text[:second_example.start()]+'## Продолжение теории\n\n'+later+text[second_example.start():]
        write(p,text); repositioned.append(lesson['lessonId'])
assert len(repositioned)==33

# Replace both sides of all specs from a single executable source of truth.
for mod in manifest['modules']:
    entries=[e for e in exercises.values() if e['lessonId'].startswith(mod['moduleId']+'-')]
    assert len(entries)>=5
    slots=collections.Counter(e['lessonId'] for e in entries)
    assert max(slots.values())<=1
    assert set(slots)<=set(l['lessonId'] for l in mod['lessons'])
    briefs='# Интерактивные задания. Ученическая часть\n\nmoduleId: '+mod['moduleId']+'\n\n'
    specs='# Интерактивные задания. Авторские спецификации\n\nmoduleId: '+mod['moduleId']+'\n\n'
    for entry in entries:
        e=entry['exercise']
        header=f'## {e["id"]} — {e["title"]}\n\n- **lessonId:** `{entry["lessonId"]}`\n- **format:** `{e["type"]}`\n\n'
        briefs+=header+'### Условие\n\n'+e['instructions']+'\n\n### Данные интерфейса\n\n```json\n'+json.dumps(e['content'],ensure_ascii=False,indent=2)+'\n```\n\n'
        # Trace is a teaching trace: snapshots/explanations are only revealed by stepping.
        # Do not give the learner the author JSON, including hidden trace states/solutions.
        if e['type']=='code-trace':
            c=e['content']; public={'language':c['language'],'code':c['code'],'initial':c['initial'],
                'questions':[{'id':p['id'],'prompt':p['prompt'],'options':p['options']} for p in c['predictions']]}
            old=json.dumps(c,ensure_ascii=False,indent=2)
            briefs=briefs.replace(old,json.dumps(public,ensure_ascii=False,indent=2))
        specs+=header+'### Контракт AnswerBook\n\n```json\n'+json.dumps(e,ensure_ascii=False,indent=2)+'\n```\n\n### Проверка и обратная связь\n\n'+e['feedback']['explanation']+'\n\n'
        if e['type'] in ('sequence','code-order'):
            specs+='Допустимые порядки перечислены полностью в acceptedOrders; новые порядки по смысловому сходству автоматически не принимаются.\n\n'
        elif e['type']=='code-debug':
            specs+='Одна ошибка, номер строки начинается с 1. Вариант заменяет всю строку. В acceptedFixes указаны только допустимые ID готовых замен.\n\n'
    write(destination/mod['interactiveBriefsFile'],briefs)
    write(destination/mod['interactiveSpecsFile'],specs)
    dump(destination/mod['directory']/'interactive_contracts.json',entries)
    # Remove obsolete inline references; put the single exercise at the final-test boundary.
    for lesson in mod['lessons']:
        p=destination/lesson['file']; text=read(p)
        text=re.sub(r'(?ms)^## Интерактив[^\n]*\n.*?(?=^## |\Z)','',text)
        # Some lesson prose carries an exercise ID outside the old named section.
        for eid in re.findall(r'sql-foundations-m\d+-ex\d+',text):
            if eid not in exercises or exercises[eid]['lessonId']!=lesson['lessonId']:
                text=re.sub(r'(?m)^.*'+re.escape(eid)+r'.*\n?','',text)
        entry=next((e for e in entries if e['lessonId']==lesson['lessonId']),None)
        if entry:
            marker='## Итоговый тест'
            assert marker in text,p
            text=text.replace(marker,f'## Интерактив\n\nВыполните `{entry["exercise"]["id"]}`: {entry["exercise"]["title"]}.\n\n'+marker,1)
        write(p,text)
    titles='\n'.join(f'{i}. {l["title"]} — `{Path(l["file"]).name}`.' for i,l in enumerate(mod['lessons'],1))
    types=collections.Counter(e['exercise']['type'] for e in entries)
    write(destination/mod['directory']/'README.md',f'# {mod["title"]}\n\nmoduleId: {mod["moduleId"]}\n\nPostgreSQL 18. Уроков: {len(mod["lessons"])}. Интерактивов: {len(entries)}.\n\n## Уроки\n\n{titles}\n\n## Интерактивы\n\n'+ '\n'.join(f'- {k}: {v}' for k,v in types.items())+'\n\nКаждый урок содержит две промежуточные проверки и пять итоговых вопросов. Ученические условия и полные авторские контракты находятся в отдельных файлах.\n')
    # Original reports remain in the untouched source; do not ship contradictory old copies.
    old=destination/mod['directory']/'check_report.md'
    write(old,f'# Проверка модуля\n\nУроков: {len(mod["lessons"])}; интерактивов: {len(entries)}; максимум один на урок.\n\nЭто структурная фиксация, не отчёт о выполнении SQL. Итоговые runtime-результаты и ограничения см. в REVISION_AUDIT_2026-11-04.md в корне комплекта.\n')

dump(destination/'course_manifest.json',manifest)
dump(destination/'interactive_contracts.json',list(exercises.values()))
write(destination/'README.md','# SQL: комплект для AnswerBook\n\nPostgreSQL 18. 16 модулей, 98 уроков, 97 интерактивов и 1041 вопрос.\n\nНачинайте с course_manifest.json. Учебные файлы и ключи разделены. interactive_contracts.json содержит готовые объекты упражнений с привязкой к урокам, проверяемые валидатором проекта; это ещё не опубликованный JSON целого курса.\n\nИсходный комплект сохранён отдельно без изменений. Новая ревизия: 4 ноября 2026 г.\n\nРезультаты проверок и ограничения: REVISION_AUDIT_2026-11-04.md.\n')
write(destination/'curriculum.md','# Программа SQL\n\nPostgreSQL 18\n\n'+'\n\n'.join('## '+m['title']+'\n\n'+'\n'.join('- '+l['title'] for l in m['lessons']) for m in manifest['modules']))
write(destination/'progress.md','# Статус\n\nРевизия авторского комплекта завершена. Следующий этап — импорт полной теории и вопросов в модель курса AnswerBook и UI-приёмка. Готовые интерактивные объекты находятся в interactive_contracts.json; публикация каталога и облачная загрузка не выполнялись. Результаты проверок указаны отдельно в отчёте.\n')
p=destination/'references.md'
write(p,'# Примечание к ревизии 4 ноября 2026 г.\n\nЦелевая версия: PostgreSQL 18. Ниже сохранена история источников и проверок первоначального автора. Текущие результаты фактического запуска вынесены в REVISION_AUDIT_2026-11-04.md; старые утверждения «SQL не запускался» относятся к первоначальной подготовке, а не к этой ревизии. Ссылки закреплены на ветке документации 18.\n\n'+read(p).replace('/docs/current/','/docs/18/'))
summary={'source':str(source),'output':str(destination),'modules':16,'lessons':98,'exercises':len(exercises),'feedbackRewritten':count_feedback,'checksMovedInLessons':repositioned,
 'removedExercises':['sql-foundations-m04-ex05','sql-foundations-m10-ex06','sql-foundations-m14-ex06','sql-foundations-m15-ex06'],
 'correctedAnswerKeys':['sql-foundations-m02-l02-q03','sql-foundations-m02-l02-q04'],
 'types':dict(collections.Counter(e['exercise']['type'] for e in exercises.values()))}
dump(workspace/'artifacts/sql-course-revision-summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
