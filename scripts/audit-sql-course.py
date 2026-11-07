"""Read-only structural audit of an external Markdown authoring course."""
import collections
import hashlib
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
out = Path(__file__).resolve().parents[1] / 'artifacts' / (sys.argv[2] if len(sys.argv)>2 else 'sql-course-audit.json')
manifest = json.loads((root / 'course_manifest.json').read_text(encoding='utf-8-sig'))
qid = r'sql-foundations-m\d+-l\d+-(?:c|q)\d+[a-z]?|sql-foundations-m\d+-exam-q\d+[a-z]?'
rows, problems, all_ids, all_keys, all_types = [], [], [], [], collections.Counter()

def read(path):
    return path.read_text(encoding='utf-8-sig')

def canonical(text):
    return re.sub(r'[\s`*«»“”".,;:!?]+', '', text).casefold()

for module in manifest['modules']:
    directory = root / module['directory']
    sources = [root / lesson['file'] for lesson in module['lessons']] + [root / module['examFile']]
    key_text = read(root / module['answerKeyFile'])
    key_blocks = re.split(r'(?m)^#{2,4}\s+(' + qid + r')\s*$', key_text)
    keys, distributions = {}, collections.Counter()
    for i in range(1, len(key_blocks), 2):
        key_id, body = key_blocks[i], key_blocks[i+1]
        answer = re.search(r'Правильный ответ:\s*([ABCD])(?:\s*[—–-]\s*«(.*?)»)?', body, re.S)
        if key_id in keys:
            problems.append(f'Duplicate key {key_id}')
        keys[key_id] = (answer.group(1), answer.group(2)) if answer else None
        if answer:
            distributions[answer.group(1)] += 1
        else:
            problems.append(f'Unparsed answer {key_id}')
    questions, lesson_counts, undeclared = {}, [], []
    for path in sources:
        if not path.exists():
            problems.append(f'Missing file {path.relative_to(root)}')
            continue
        text = read(path)
        parts = re.split(r'(?m)^questionId:\s*`?(' + qid + r')`?\s*$', text)
        counts = collections.Counter()
        for i in range(1, len(parts), 2):
            question_id, body = parts[i], parts[i+1]
            counts['intermediate' if re.search(r'-c\d+[a-z]?$',question_id) else 'final'] += 1
            if question_id in questions:
                problems.append(f'Duplicate question {question_id}')
            choices = dict(re.findall(r'(?m)^([ABCD])[.)]\s+(.+?)\s*$', body))
            questions[question_id] = {'file':str(path.relative_to(root)), 'choices':choices}
            if set(choices) != set('ABCD'):
                problems.append(f'Options missing {question_id}: {list(choices)}')
            key = keys.get(question_id)
            if key and key[1] and key[0] in choices and canonical(choices[key[0]]) != canonical(key[1]):
                problems.append(f'Answer text differs {question_id}: {choices[key[0]]} / {key[1]}')
        if path.name != 'module_exam.md':
            lesson_counts.append({'file':path.name, 'questions':sum(counts.values()), **counts})
            if counts != {'intermediate':2,'final':5}:
                problems.append(f'Question count {path.relative_to(root)}: {dict(counts)}')
        if 'правильный ответ:' in text.casefold():
            problems.append(f'Answer disclosed in {path.relative_to(root)}')
    for missing in set(questions)-set(keys):
        problems.append(f'Missing key {missing}')
    for extra in set(keys)-set(questions):
        problems.append(f'Extra key {extra}')
    specs = read(root / module['interactiveSpecsFile'])
    briefs = read(root / module['interactiveBriefsFile'])
    ex_parts = re.split(r'(?m)^##\s+(sql-foundations-m\d+-ex\d+)\s*[^\n]*\n', specs)
    exercises = []
    for i in range(1, len(ex_parts), 2):
        ex_id, body = ex_parts[i], ex_parts[i+1]
        lesson = re.search(r'sql-foundations-m\d+-l\d+', body)
        fmt = re.search(r'(?:format|Формат)\*{0,2}:\*{0,2}\s*`?([a-z-]+)', body)
        kind = fmt.group(1) if fmt else 'unparsed'
        exercises.append({'id':ex_id,'lessonId':lesson.group(0) if lesson else None,'type':kind})
        all_types[kind] += 1
        if ex_id not in briefs:
            problems.append(f'Missing student brief {ex_id}')
    slots = collections.Counter(ex['lessonId'] for ex in exercises)
    conflicts = {key:value for key,value in slots.items() if value > 1}
    declared = set(sources)
    for path in directory.glob('[0-9][0-9]_*.md'):
        if path not in declared:
            undeclared.append(path.name)
    references=[]
    for field in ['examFile','answerKeyFile','interactiveBriefsFile','interactiveSpecsFile']:
        if not (root / module[field]).exists():
            problems.append(f'Missing manifest path {module[field]}')
    rows.append({'moduleId':module['moduleId'],'title':module['title'],'lessons':len(module['lessons']),
                 'lessonCounts':lesson_counts,'questions':len(questions),'keys':len(keys),
                 'examQuestions':sum('-exam-' in key for key in questions),'answerDistribution':dict(distributions),
                 'exercises':exercises,'interactiveLessonConflicts':conflicts,'undeclaredLessons':undeclared,
                 'sqlFiles':len(list((directory/'examples').glob('*.sql'))),
                 'genericDistractorExplanations':key_text.count('этот вариант не выполняет требование вопроса')})
    all_ids += list(questions)
    all_keys += list(keys)

duplicate_ids=[k for k,v in collections.Counter(all_ids).items() if v>1]
result={'root':str(root),'courseId':manifest['courseId'],'targetVersion':manifest['targetVersion'],
        'totals':{'modules':len(rows),'lessons':sum(m['lessons'] for m in rows),'questions':len(all_ids),
                  'keys':len(all_keys),'exercises':sum(len(m['exercises']) for m in rows),
                  'sqlFiles':sum(m['sqlFiles'] for m in rows),'types':dict(all_types)},
        'modules':rows,'structuralProblems':problems,'duplicateQuestionIds':duplicate_ids}
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result['totals'],ensure_ascii=False))
for m in rows:
    print(m['moduleId'],m['lessons'],m['questions'],m['keys'],len(m['exercises']),m['interactiveLessonConflicts'])
print('Structural problems:',len(problems))
for problem in problems[:35]: print(problem)
print('Report:',out)
