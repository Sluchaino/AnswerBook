export type Scalar=string|number|boolean
export type ScalarType='string'|'number'|'boolean'
export type DataItem=Scalar|Record<string,Scalar>
export type DataSchema={kind:'scalar';valueType:ScalarType}|{kind:'object';fields:Record<string,ScalarType>}
export type DataResult={kind:'list';items:DataItem[]}|{kind:'groups';groups:{key:Scalar;items:DataItem[]}[]}|{kind:'count';value:number}
export type Compare='=='|'!='|'>'|'>='|'<'|'<='
export type Direction='asc'|'desc'
type DefinitionBase={id:string;title:string;explanation?:string}
export type DataOperation=DefinitionBase&(
  {type:'filter';fields:string[];operators:Compare[];values:Scalar[]}|
  {type:'select';fields:string[];modes:('object'|'scalar')[]}|
  {type:'order-by'|'then-by';fields:string[];directions:Direction[]}|
  {type:'group-by';fields:string[]}|
  {type:'count';modes:('all'|'groups')[]})
export type DataKind=DataOperation['type']
export type DataStep={operationId:string}&(
  {type:'filter';field:string;operator:Compare;value:Scalar}|
  {type:'select';fields:string[];mode:'object'|'scalar'}|
  {type:'order-by'|'then-by';field:string;direction:Direction}|
  {type:'group-by';field:string}|
  {type:'count';mode:'all'|'groups'})
export type DataContent={source:DataItem[];schema:DataSchema;operations:DataOperation[];target:DataResult;presentation:'generic'|'linq'|'sql'|'python'}
export type DataValidation={order:'ordered'|'unordered';groupOrder:'ordered'|'unordered';requiredOperations:DataKind[];forbiddenOperations:DataKind[];maxSteps:number;solution:DataStep[]}
export type DataSpec={content:DataContent;validation:DataValidation}
export type DataAnswer={type:'data-transform';steps:DataStep[]}
export type DataCondition={id:string;label:string;passed:boolean}
export type DataFrame=({kind:'list';items:DataItem[]}|{kind:'groups';groups:{key:Scalar;items:DataItem[]}[];keyType:ScalarType})&{schema:DataSchema;sortKeys?:{field:string;direction:Direction}[]}|{kind:'count';value:number}
export type DataRun={frame:DataFrame;steps:{frame?:DataFrame;error?:string}[];error?:string}

const kinds:DataKind[]=['filter','select','order-by','then-by','group-by','count']
const comparisons:Compare[]=['==','!=','>','>=','<','<=']
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const own=(v:object,k:string)=>Object.hasOwn(v,k)
function keys(v:unknown,required:string[],optional:string[]=[]) {
  if(!isRecord(v)||required.some(k=>!own(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))throw new Error('Неверные поля преобразования данных')
}
const field=(s:unknown):s is string=>typeof s==='string'&&(s==='$value'||/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(s))&&!['__proto__','constructor','prototype'].includes(s)
const id=(s:unknown):s is string=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(s)
const text=(s:unknown)=>typeof s==='string'&&!!s.trim()&&s.length<=2000
const scalar=(s:unknown):s is Scalar=>typeof s==='boolean'||typeof s==='number'&&Number.isFinite(s)||typeof s==='string'&&s.length<=500
function list(v:unknown,allowed:readonly unknown[],min=1,max=20) {
  if(!Array.isArray(v)||v.length<min||v.length>max||new Set(v).size!==v.length||v.some(x=>!allowed.includes(x)))throw new Error('Недопустимые параметры операции')
}
function fields(v:unknown) {if(!Array.isArray(v)||!v.length||v.length>12||new Set(v).size!==v.length||v.some(f=>!field(f)))throw new Error('Неверные поля данных')}
function datum(v:unknown):asserts v is DataItem {
  if(scalar(v))return
  if(!isRecord(v)||!Object.keys(v).length||Object.keys(v).length>12||Object.entries(v).some(([k,value])=>!field(k)||k==='$value'||!scalar(value)))throw new Error('Поддерживаются только простые значения и плоские объекты')
}
function dataList(v:unknown):asserts v is DataItem[] {if(!Array.isArray(v)||v.length>100)throw new Error('Допустимо до 100 элементов');for(const x of v)datum(x)}
function schema(v:unknown):asserts v is DataSchema {
  if(!isRecord(v))throw new Error('Неверная схема данных')
  if(v.kind==='scalar'){keys(v,['kind','valueType']);if(typeof v.valueType!=='string'||!['string','number','boolean'].includes(v.valueType))throw new Error('Неверный тип значений')}
  else {keys(v,['kind','fields']);if(v.kind!=='object'||!isRecord(v.fields))throw new Error('Неверная схема объектов');fields(Object.keys(v.fields));if(own(v.fields,'$value')||Object.values(v.fields).some(t=>typeof t!=='string'||!['string','number','boolean'].includes(t)))throw new Error('Неверные типы полей')}
}
function matchesSchema(value:DataItem,s:DataSchema) {
  if(s.kind==='scalar')return typeof value===s.valueType
  return isRecord(value)&&Object.keys(value).length===Object.keys(s.fields).length&&Object.entries(s.fields).every(([k,t])=>own(value,k)&&typeof value[k]===t)
}
function validateResult(r:unknown) {
  if(!isRecord(r))throw new Error('Неверный целевой результат')
  if(r.kind==='list'){keys(r,['kind','items']);dataList(r.items)}
  else if(r.kind==='count'){keys(r,['kind','value']);if(!Number.isInteger(r.value)||Number(r.value)<0||Number(r.value)>100)throw new Error('Неверное количество')}
  else if(r.kind==='groups'){
    keys(r,['kind','groups']);if(!Array.isArray(r.groups)||r.groups.length>100)throw new Error('Неверные группы')
    let count=0;const seen=new Set<string>()
    for(const g of r.groups){keys(g,['key','items']);if(!scalar(g.key)||seen.has(JSON.stringify(g.key)))throw new Error('Неверный ключ группы');seen.add(JSON.stringify(g.key));dataList(g.items);count+=g.items.length}
    if(count>100)throw new Error('Слишком много элементов в группах')
  } else throw new Error('Неизвестный вид результата')
}
export function validateDataContent(c:DataContent) {
  keys(c,['source','schema','operations','target','presentation']);schema(c.schema);dataList(c.source);validateResult(c.target)
  if(c.source.some(x=>!matchesSchema(x,c.schema))||!['generic','linq','sql','python'].includes(c.presentation))throw new Error('Данные не соответствуют схеме')
  if(!Array.isArray(c.operations)||!c.operations.length||c.operations.length>20||new Set(c.operations.map(o=>o?.id)).size!==c.operations.length)throw new Error('Неверный каталог операций')
  for(const o of c.operations){
    const common=['id','title','type'],optional=['explanation']
    if(!o||!id(o.id)||!text(o.title)||o.explanation!==undefined&&!text(o.explanation))throw new Error('Неверное описание операции')
    if(o.type==='filter'){keys(o,[...common,'fields','operators','values'],optional);fields(o.fields);list(o.operators,comparisons);if(!Array.isArray(o.values)||!o.values.length||o.values.length>30||o.values.some(x=>!scalar(x)))throw new Error('Неверные значения фильтра')}
    else if(o.type==='select'){keys(o,[...common,'fields','modes'],optional);fields(o.fields);if(o.fields.includes('$value'))throw new Error('Select выбирает поля объектов');list(o.modes,['object','scalar'])}
    else if(o.type==='order-by'||o.type==='then-by'){keys(o,[...common,'fields','directions'],optional);fields(o.fields);list(o.directions,['asc','desc'])}
    else if(o.type==='group-by'){keys(o,[...common,'fields'],optional);fields(o.fields)}
    else if(o.type==='count'){keys(o,[...common,'modes'],optional);list(o.modes,['all','groups'])}
    else throw new Error('Неизвестная операция данных')
  }
}
export function validateDataSpec(spec:DataSpec) {
  validateDataContent(spec.content)
  const c=spec.content,v=spec.validation
  keys(v,['order','groupOrder','requiredOperations','forbiddenOperations','maxSteps','solution'])
  if(!['ordered','unordered'].includes(v.order)||!['ordered','unordered'].includes(v.groupOrder)||!Number.isInteger(v.maxSteps)||v.maxSteps<1||v.maxSteps>12)throw new Error('Неверные ограничения решения')
  list(v.requiredOperations,kinds,0);list(v.forbiddenOperations,kinds,0)
  if(v.requiredOperations.some(k=>v.forbiddenOperations.includes(k)||!c.operations.some(o=>o.type===k)))throw new Error('Противоречивые требования к операциям')
  validateDataSteps(spec,v.solution)
  if(!v.solution.length)throw new Error('Эталонная цепочка должна содержать операцию')
  if(!gradeData(spec,v.solution).correct)throw new Error('Эталонная цепочка не достигает цели или нарушает требования')
}

export function validateDataSteps(spec:DataSpec,value:unknown):asserts value is DataStep[] {
  if(!Array.isArray(value)||value.length>12)throw new Error('Допустимо до 12 операций')
  for(const s of value){
    if(!isRecord(s)||typeof s.operationId!=='string')throw new Error('Неверная операция в цепочке')
    const o=spec.content.operations.find(o=>o.id===s.operationId)
    if(!o||s.type!==o.type)throw new Error('Операция не разрешена заданием')
    const common=['operationId','type']
    if(o.type==='filter'){
      keys(s,[...common,'field','operator','value'])
      if((typeof s.field!=='string'||!o.fields.includes(s.field))||!o.operators.includes(s.operator as Compare)||!scalar(s.value)||!o.values.some(v=>v===s.value))throw new Error('Недопустимый параметр фильтра')
    } else if(o.type==='select'){
      keys(s,[...common,'fields','mode']);list(s.fields,o.fields,1,12)
      if(!o.modes.includes(s.mode as 'object'|'scalar')||s.mode==='scalar'&&(s.fields as string[]).length!==1)throw new Error('Скалярная проекция выбирает одно поле')
    } else if(o.type==='order-by'||o.type==='then-by'){
      keys(s,[...common,'field','direction']);if((typeof s.field!=='string'||!o.fields.includes(s.field))||!o.directions.includes(s.direction as Direction))throw new Error('Недопустимая сортировка')
    } else if(o.type==='group-by') {keys(s,[...common,'field']);if((typeof s.field!=='string'||!o.fields.includes(s.field)))throw new Error('Недопустимое поле группировки')}
    else if(o.type==='count'){keys(s,[...common,'mode']);if(!o.modes.includes(s.mode as 'all'|'groups'))throw new Error('Недопустимый режим подсчёта')}
    else throw new Error('Неизвестная операция')
  }
}
export function dataFieldType(frame:DataFrame,name:string):ScalarType {
  if(frame.kind==='count')throw new Error('После Count получено число, а не коллекция')
  const s=frame.schema
  if(s.kind==='scalar'){if(name!=='$value')throw new Error('У скалярных значений нет поля '+name);return s.valueType}
  if(!field(name)||!own(s.fields,name))throw new Error('Поле отсутствует: '+name)
  return s.fields[name]
}
function get(row:DataItem,name:string,s:DataSchema):Scalar {
  if(s.kind==='scalar'){if(name!=='$value'||typeof row!==s.valueType)throw new Error('Неверное скалярное значение');return row as Scalar}
  if(!isRecord(row)||!own(row,name))throw new Error('Поле отсутствует: '+name)
  return row[name] as Scalar
}
// Ordinal UTF-16 comparison, case-sensitive; no platform locale or coercion.
const compare=(a:Scalar,b:Scalar)=>a===b?0:a<b?-1:1
function apply(frame:DataFrame,s:DataStep):DataFrame {
  if(s.type==='count') {
    if(frame.kind==='count')throw new Error('Count ожидает коллекцию')
    if(s.mode==='all')return {kind:'count',value:frame.kind==='groups'?frame.groups.length:frame.items.length}
    if(frame.kind!=='groups')throw new Error('Подсчёт по группам требует GroupBy')
    return {kind:'list',schema:{kind:'object',fields:{key:frame.keyType,count:'number'}},items:frame.groups.map(g=>({key:g.key,count:g.items.length}))}
  }
  if(frame.kind!=='list')throw new Error('Эта операция ожидает список; после GroupBy используйте Count по группам')
  if(s.type==='select'){
    if(frame.schema.kind!=='object')throw new Error('Select ожидает объекты с полями')
    const types=Object.fromEntries(s.fields.map(f=>[f,dataFieldType(frame,f)]))
    if(s.mode==='scalar')return {kind:'list',schema:{kind:'scalar',valueType:types[s.fields[0]]},items:frame.items.map(row=>get(row,s.fields[0],frame.schema))}
    return {kind:'list',schema:{kind:'object',fields:types},items:frame.items.map(row=>Object.fromEntries(s.fields.map(f=>[f,get(row,f,frame.schema)])))}
  }
  const type=dataFieldType(frame,s.field)
  if(s.type==='filter'){
    if(typeof s.value!==type)throw new Error('Тип значения фильтра не совпадает с типом поля')
    if(type!=='number'&&!['==','!='].includes(s.operator))throw new Error('Для строк и логических значений доступны только == и !=')
    return {kind:'list',schema:frame.schema,items:frame.items.filter(row=>{
      const v=get(row,s.field,frame.schema),n=compare(v,s.value)
      return s.operator==='=='?n===0:s.operator==='!='?n!==0:s.operator==='>'?n>0:s.operator==='>='?n>=0:s.operator==='<'?n<0:n<=0
    })}
  }
  if(s.type==='group-by'){
    const groups=new Map<string,{key:Scalar;items:DataItem[]}>()
    for(const row of frame.items){const key=get(row,s.field,frame.schema),encoded=JSON.stringify(key);if(!groups.has(encoded))groups.set(encoded,{key,items:[]});groups.get(encoded)!.items.push(row)}
    return {kind:'groups',schema:frame.schema,keyType:type,groups:[...groups.values()]}
  }
  if(type==='boolean')throw new Error('Сортировка поддерживает числа и строки')
  if(s.type==='then-by'&&!frame.sortKeys)throw new Error('ThenBy применяется непосредственно после OrderBy или ThenBy')
  const sortKeys=s.type==='then-by'?[...frame.sortKeys!,{field:s.field,direction:s.direction}]:[{field:s.field,direction:s.direction}]
  const items=frame.items.map((row,index)=>({row,index})).sort((a,b)=>{
    for(const key of sortKeys){const n=compare(get(a.row,key.field,frame.schema),get(b.row,key.field,frame.schema));if(n)return key.direction==='asc'?n:-n}return a.index-b.index
  }).map(x=>x.row)
  return {...frame,items,sortKeys}
}
export function runData(spec:DataSpec,steps:DataStep[]):DataRun {
  let frame:DataFrame={kind:'list',schema:structuredClone(spec.content.schema),items:structuredClone(spec.content.source)}
  const results:DataRun['steps']=[]
  try {validateDataSteps(spec,steps)}catch(error){return {frame,steps:[],error:error instanceof Error?error.message:'Неверная цепочка'}}
  for(const s of steps){try{frame=apply(frame,s);results.push({frame})}catch(error){const message=error instanceof Error?error.message:'Ошибка операции';results.push({error:message});return {frame,steps:results,error:message}}}
  return {frame,steps:results}
}
export function dataResult(frame:DataFrame):DataResult {return frame.kind==='count'?{kind:'count',value:frame.value}:frame.kind==='groups'?{kind:'groups',groups:frame.groups}:{kind:'list',items:frame.items}}
function canonical(v:DataItem) {return JSON.stringify(typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)}
const arrayKey=(items:DataItem[],unordered:boolean)=>{const encoded=items.map(canonical);return JSON.stringify(unordered?encoded.sort():encoded)}
export function sameData(a:DataResult,b:DataResult,order:'ordered'|'unordered',groupOrder:'ordered'|'unordered'):boolean {
  if(a.kind!==b.kind)return false
  if(a.kind==='count'&&b.kind==='count')return a.value===b.value
  if(a.kind==='list'&&b.kind==='list')return arrayKey(a.items,order==='unordered')===arrayKey(b.items,order==='unordered')
  if(a.kind==='groups'&&b.kind==='groups'){
    const encode=(groups:typeof a.groups)=>{const list=groups.map(g=>JSON.stringify([g.key,arrayKey(g.items,order==='unordered')]));return JSON.stringify(groupOrder==='unordered'?list.sort():list)}
    return encode(a.groups)===encode(b.groups)
  }
  return false
}
export function gradeData(spec:DataSpec,steps:DataStep[]):{correct:boolean;conditions:DataCondition[]} {
  const run=runData(spec,steps),v=spec.validation
  const conditions:DataCondition[]=[{id:'nonempty',label:'Добавлена хотя бы одна операция',passed:steps.length>0},{id:'execution',label:'Цепочка выполняется без ошибок',passed:!run.error},{id:'result',label:'Целевой результат достигнут',passed:!run.error&&sameData(dataResult(run.frame),spec.content.target,v.order,v.groupOrder)},{id:'limit',label:`Не больше ${v.maxSteps} операций`,passed:steps.length<=v.maxSteps}]
  for(const kind of v.requiredOperations)conditions.push({id:'required-'+kind,label:'Использована операция '+operationName(kind,spec.content.presentation),passed:steps.some(s=>s.type===kind)})
  for(const kind of v.forbiddenOperations)conditions.push({id:'forbidden-'+kind,label:'Не используется '+operationName(kind,spec.content.presentation),passed:!steps.some(s=>s.type===kind)})
  return {correct:conditions.every(c=>c.passed),conditions}
}
export function operationName(kind:DataKind,presentation:DataContent['presentation']) {
  const names={filter:['Фильтр','Where','WHERE','filter'],select:['Выбор полей','Select','SELECT','projection'],'order-by':['Сортировка','OrderBy','ORDER BY','sorted'],'then-by':['Дополнительная сортировка','ThenBy','ORDER BY (второй ключ)','sorted (второй ключ)'],'group-by':['Группировка','GroupBy','GROUP BY','group by'],count:['Количество','Count','COUNT','len']}
  return names[kind][['generic','linq','sql','python'].indexOf(presentation)]
}
export function describeDataStep(s:DataStep,p:DataContent['presentation']):string {
  const name=operationName(s.type,p)
  return name+' ('+(s.type==='filter'?`${s.field} ${s.operator} ${JSON.stringify(s.value)}`:s.type==='select'?`${s.fields.join(', ')} → ${s.mode==='scalar'?'значения':'объекты'}`:s.type==='count'?s.mode==='groups'?'по группам':'вся коллекция':s.type==='group-by'?s.field:`${s.field}, ${s.direction==='asc'?'по возрастанию':'по убыванию'}`)+')'
}
