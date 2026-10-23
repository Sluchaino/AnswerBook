"""Build the offline reading library from the user's PDF sources.

Uses PDF font/position information to preserve paragraphs, headings and examples.
Run from the project root with pdfplumber available; no network access is needed.
"""
import json, pathlib, re, sys
import pdfplumber

sys.stdout.reconfigure(encoding='utf-8')
data = pathlib.Path('src/data')
source_root = pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path.home()/'Downloads'
catalog = json.loads((data/'learning-catalog.json').read_text(encoding='utf-8'))
chapter_map = [
 [[1],[2],[4],[5],[3,7],[6],[9],[10],[9,11,13],[11],[12],[13,14],[8],[1,2],[3,10,11],[4],[5],[6,7],[9],[7,8]],
 [[1,3],[2],[4,12],[5],[6],[7],[9],[10,11],[8],[5],[13,14]],
 [[1,2],[2,3,4],[5],[6,7],[8],[9],[11],[12],[13],[14,15],[10]],
 [[1,2],[3],[6],[7],[8,9],[5],[4],[5],[10],[11],[12],[13],[9],[15],[16,17],[14,18]],
 [[1,14],[4],[9,10,11],[13,15],[8],[8],[8],[10],[2,3],[5,6],[7,14]],
 [[1,2,3],[4,5],[6],[7,18],[8],[9,19],[10],[11],[12],[13,14,15,20,21]],
 [[1,2,10],[3,9,17],[4],[5],[6,7],[8,18],[11],[12,19],[13],[14,15,20]],
 [[1,2],[3,4],[5,21],[6,7,20],[8],[9,10,19],[11,21],[12,22],[13,14,15],[16,17]],
 [[1,2],[3,4],[5,22],[6,7],[8],[9,20],[10,11,21],[12,19],[13,14],[15,16,17]],
 [[1,2,3,24],[4,5,21],[6,10],[7,20],[8,9],[11],[12,22],[13,23],[14,15],[16,17,18]],
 [[1],[2],[3],[4],[5],[6],[7],[8,9],[10],[11],[12],[13,14,15]],
 [[1,2],[3],[4],[5,6],[7],[8],[9],[10],[11],[12],[13,14],[15,16,17]],
 [[1,2],[3],[4],[5],[6,7],[8,9],[10,11],[12],[13],[14],[15],[16,17,18,19]],
 [[1,2],[3],[4],[5],[6],[7,8],[9],[10],[11,12],[13],[14,15],[16],[17],[18,19,20]],
 [[1,2,24],[3,4],[5],[6,7],[8,9],[10,16],[11,12,13],[14,15],[17],[18,19],[20,21],[22,23]],
]

def clean_prose(text):
    text=re.sub(r'\s+',' ',text).strip()
    text=re.sub(r'\s+([,;:!?\)\]])',r'\1',text)
    text=re.sub(r'\s+\.(?=\s|$)', '.', text)
    text=re.sub(r'([\(\[])\s+',r'\1',text)
    text=text.replace('ASP .NET','ASP.NET').replace('IP .','IP.').replace('TCP .','TCP.')
    text=re.sub(r'(?<=[A-Za-zА-Яа-я])-\s+(?=[a-zа-я])','-',text)
    return text

def join_code(words):
    result=''; previous=None
    for w in sorted(words,key=lambda x:x['x0']):
        if previous:
            gap=w['x0']-previous['x1']
            # Font changes split keywords into separate runs even without a space.
            if gap > .5 or (result[-1:].isalnum() and w['text'][:1].isalnum()):
                result+=' '*max(1,round(gap/max(w['size']*.6,1)))
        result+=w['text'];previous=w
    keywords=r'(public|private|protected|internal|static|sealed|abstract|async|await|override|readonly|new|using|return|throw)'
    for _ in range(3):
        result=re.sub(r'\b'+keywords+r'(?=(?:class|struct|record|void|int|bool|string|Task|new|sealed|static|async|override|readonly)\b)',r'\1 ',result)
    return result.rstrip()

def extract_book(filename):
    chapters={};current=None;buffer=[];buffer_kind=None;previous_y=None;previous_page=None;code_indent=0
    def flush():
        nonlocal buffer,buffer_kind
        if current and buffer:
            text='\n'.join(buffer) if buffer_kind in ('code','table') else clean_prose(' '.join(buffer))
            if text.strip():current['content'].append({'kind':buffer_kind,'text':text})
        buffer=[];buffer_kind=None
    with pdfplumber.open(source_root/filename) as pdf:
        for page_index,page in enumerate(pdf.pages):
            if page_index<2:continue
            words=page.extract_words(extra_attrs=['fontname','size'],x_tolerance=1,y_tolerance=2)
            lines=[]
            for word in sorted(words,key=lambda w:(w['bottom'],w['x0'])):
                if word['top']<50 or word['bottom']>page.height-40:continue
                match=next((line for line in reversed(lines[-4:]) if abs(line[0]-word['bottom'])<2.5),None)
                if match is None:lines.append([word['bottom'],[word]])
                else:match[1].append(word)
            for bottom,items in sorted(lines):
                items.sort(key=lambda w:w['x0']);text=' '.join(w['text'] for w in items)
                size=max(w['size'] for w in items)
                heading=size>=14
                pattern=r'^(\d+[А-ЯA-Z]?)\.\s+(.+)' if int(filename[:2])>=17 else r'^(\d+)\.\s+(.+)'
                main=re.match(pattern,text) if heading else None
                if heading and re.match(r'^(Источники|Контроль понимания)',text):flush();current=None
                if main:
                    flush();number=int(main[1]) if main[1].isdigit() else main[1]
                    current={'title':main[2],'source':filename,'pages':[page_index+1],'content':[]}
                    chapters[number]=current
                    previous_y=bottom;previous_page=page_index;continue
                if not current:continue
                if page_index+1 not in current['pages']:current['pages'].append(page_index+1)
                # A chapter title can wrap across multiple large-font lines.
                if heading and not current['content'] and not buffer:
                    current['title']+=' '+text;previous_y=bottom;previous_page=page_index;continue
                mono=sum('Mono' in w['fontname'] for w in items)/len(items)
                kind='heading' if heading or (size>=12.5 and re.match(r'^\d+\.\d+\.',text)) else 'code' if mono>.7 and size<11 else 'table' if size<9.5 else 'paragraph'
                new_paragraph=previous_page!=page_index or (previous_y is not None and bottom-previous_y>size*2.05)
                if kind!=buffer_kind or (kind=='paragraph' and new_paragraph) or kind=='heading':flush()
                if kind=='code':
                    x=min(w['x0'] for w in items)
                    if not buffer:code_indent=x
                    text=' '*max(0,round((x-code_indent)/max(size*.6,1)))+join_code(items)
                elif kind=='table':text='   '.join(w['text'] for w in items)
                buffer_kind=kind;buffer.append(text)
                if kind=='heading':flush()
                previous_y=bottom;previous_page=page_index
    flush()
    for chapter in chapters.values():
        chapter['title']=clean_prose(chapter['title'])
        chapter['pages']=f"{min(chapter['pages'])}–{max(chapter['pages'])}" if len(chapter['pages'])>1 else str(chapter['pages'][0])
    return chapters

if __name__=='__main__':
    books={}
    for entry in catalog:
        for source in entry['sources']:
            if source['file'] not in books:
                book=extract_book(source['file']);books[source['file']]=book
                print(source['file'],len(book),'chapters',flush=True)
    readings={}
    for course_index,entry in enumerate(catalog):
        course=json.loads((data/entry['file']).read_text(encoding='utf-8'))
        mapping=chapter_map[course_index] if course_index<len(chapter_map) else [lesson['readingChapters'] for lesson in course['lessons']]
        assert len(mapping)==len(course['lessons']),entry['id']
        readings[entry['id']]={}
        for lesson,numbers in zip(course['lessons'],mapping,strict=True):
            book=books[lesson['source']]
            missing=set(numbers)-set(book)
            assert not missing,(entry['id'],lesson['id'],missing)
            sections=[book[n] for n in numbers]
            assert all(s['content'] for s in sections),(entry['id'],lesson['id'])
            readings[entry['id']][lesson['id']]=sections
    (data/'learning-readings.json').write_text(json.dumps(readings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Reading library:',sum(len(v) for v in readings.values()),'lessons',flush=True)
