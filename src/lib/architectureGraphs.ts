export type GraphComponent={id:string;label:string;category:string;description?:string;icon?:string;maxInstances:number;allowedRelations:string[];roles?:{id:string;label:string}[]}
export type GraphRelation={id:string;label:string;directed:boolean}
export type GraphNode={id:string;componentId:string;role?:string;x:number;y:number}
export type GraphEdge={id:string;source:string;target:string;relationId?:string;directed:boolean}
export type Graph={nodes:GraphNode[];edges:GraphEdge[]}
export type GraphPattern={sourceComponentId:string;targetComponentId:string;sourceRole?:string;targetRole?:string;relationId?:string;directed:boolean}
export type GraphTemplate={id:string;nodes:Omit<GraphNode,'x'|'y'>[];edges:GraphEdge[];extraComponents:string[];extraEdges:GraphPattern[]}
export type ArchitectureSpec={content:{components:GraphComponent[];relations:GraphRelation[];untyped?:{label:string;directed:boolean};allowSelfEdges:boolean};validation:{feedbackMode:'learning'|'assessment';variants:GraphTemplate[];forbiddenComponents:string[];forbiddenEdges:GraphPattern[]}}
export type GraphAnswer={type:'architecture-builder';graph:Graph;undo:Graph[];closed:boolean}
export type GraphCondition={id:string;label:string;passed:boolean}
export type GraphGrade={correct:boolean;conditions:GraphCondition[];incorrectIds:string[];variantId:string}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(v)&&!['constructor','prototype'].includes(v)
const text=(v:unknown,max=1000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max
function keys(v:unknown,required:string[],optional:string[]=[]) {
  if(!record(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))throw new Error('Неверные поля архитектурной схемы')
}
function list(v:unknown,max:number,min=0):asserts v is unknown[] {if(!Array.isArray(v)||v.length<min||v.length>max)throw new Error('Превышен лимит элементов схемы')}
function identifiers(v:unknown,allowed:string[]) {list(v,40);if(new Set(v).size!==v.length||v.some(x=>typeof x!=='string'||!allowed.includes(x)))throw new Error('Неизвестный или повторный ID схемы')}
export const relationDefinition=(spec:ArchitectureSpec,relationId?:string)=>relationId===undefined?spec.content.untyped:spec.content.relations.find(r=>r.id===relationId)
const relationKey=(id?:string)=>id??'untyped'
export const emptyGraph=():Graph=>({nodes:[],edges:[]})
export const freshGraphAnswer=():GraphAnswer=>({type:'architecture-builder',graph:emptyGraph(),undo:[],closed:false})
const nodeType=(spec:ArchitectureSpec,n:{componentId:string})=>spec.content.components.find(c=>c.id===n.componentId)!
export function graphNodeLabel(spec:ArchitectureSpec,n:Omit<GraphNode,'x'|'y'>) {
  const c=nodeType(spec,n),role=c.roles?.find(r=>r.id===n.role)
  return `${c.label}${role?` · ${role.label}`:c.maxInstances>1?` #${n.id}`:''}`
}
// Endpoints, type AND direction are significant; undirected endpoints commute.
export const graphEdgeKey=(e:GraphEdge)=>JSON.stringify([e.directed?e.source:[e.source,e.target].sort()[0],e.directed?e.target:[e.source,e.target].sort()[1],e.relationId??null,e.directed])
function validateNodes(spec:ArchitectureSpec,input:unknown,template=false):asserts input is GraphNode[] {
  list(input,20)
  const nodes=input as GraphNode[]
  if(new Set(nodes.map(n=>n?.id)).size!==nodes.length)throw new Error('Повторный ID узла')
  for(const n of nodes) {
    keys(n,template?['id','componentId']:['id','componentId','x','y'],['role'])
    const c=spec.content.components.find(c=>c.id===n.componentId)
    if(!id(n.id)||!c||c.roles?.length&&!c.roles.some(r=>r.id===n.role)||!c.roles?.length&&n.role!==undefined)throw new Error('Неизвестный компонент или роль')
    if(!template&&(!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.x>1||n.y<0||n.y>1))throw new Error('Координаты должны быть от 0 до 1')
  }
  for(const c of spec.content.components) {
    const instances=nodes.filter(n=>n.componentId===c.id)
    if(instances.length>c.maxInstances||c.roles&&new Set(instances.map(n=>n.role)).size!==instances.length)throw new Error('Слишком много экземпляров или повторная роль')
  }
}
function validateEdges(spec:ArchitectureSpec,input:unknown,nodes:Omit<GraphNode,'x'|'y'>[]):asserts input is GraphEdge[] {
  list(input,40);const edges=input as GraphEdge[]
  if(new Set(edges.map(e=>e?.id)).size!==edges.length)throw new Error('Повторный ID связи')
  for(const e of edges) {
    keys(e,['id','source','target','directed'],['relationId'])
    const from=nodes.find(n=>n.id===e.source),to=nodes.find(n=>n.id===e.target),r=relationDefinition(spec,e.relationId)
    if(!id(e.id)||!from||!to||!spec.content.allowSelfEdges&&from.id===to.id||!r||typeof e.directed!=='boolean'||e.directed!==r.directed||e.relationId!==undefined&&!id(e.relationId))throw new Error('Некорректные концы, направление или тип связи')
    if([from,to].some(n=>!nodeType(spec,n).allowedRelations.includes(relationKey(e.relationId))))throw new Error('Компонент не допускает этот тип связи')
  }
  if(new Set(edges.map(graphEdgeKey)).size!==edges.length)throw new Error('Дублирующее соединение')
}
export function validateGraph(spec:ArchitectureSpec,input:unknown):asserts input is Graph {
  keys(input,['nodes','edges']);const graph=input as Graph;validateNodes(spec,graph.nodes);validateEdges(spec,graph.edges,graph.nodes)
}
function validatePatterns(spec:ArchitectureSpec,input:unknown):asserts input is GraphPattern[] {
  list(input,40)
  for(const p of input as GraphPattern[]) {
    keys(p,['sourceComponentId','targetComponentId','directed'],['sourceRole','targetRole','relationId'])
    const a=spec.content.components.find(c=>c.id===p.sourceComponentId),b=spec.content.components.find(c=>c.id===p.targetComponentId),r=relationDefinition(spec,p.relationId)
    if(!a||!b||!r||typeof p.directed!=='boolean'||p.directed!==r.directed||[a,b].some(c=>!c.allowedRelations.includes(relationKey(p.relationId)))||p.sourceRole!==undefined&&!a.roles?.some(role=>role.id===p.sourceRole)||p.targetRole!==undefined&&!b.roles?.some(role=>role.id===p.targetRole))throw new Error('Некорректное правило соединения')
  }
  const patterns=input as GraphPattern[]
  if(patterns.some((p,i)=>patterns.slice(0,i).some(q=>patternsOverlap(p,q))))throw new Error('Повторяющиеся или перекрывающиеся правила связей')
}
function patternsOverlap(a:GraphPattern,b:GraphPattern) {
  if(a.directed!==b.directed||a.relationId!==b.relationId)return false
  const same=(a:GraphPattern,b:GraphPattern)=>a.sourceComponentId===b.sourceComponentId&&a.targetComponentId===b.targetComponentId&&(!a.sourceRole||!b.sourceRole||a.sourceRole===b.sourceRole)&&(!a.targetRole||!b.targetRole||a.targetRole===b.targetRole)
  return same(a,b)||!a.directed&&same(a,{...b,sourceComponentId:b.targetComponentId,targetComponentId:b.sourceComponentId,sourceRole:b.targetRole,targetRole:b.sourceRole})
}
export function patternMatches(p:GraphPattern,e:GraphEdge,nodes:Omit<GraphNode,'x'|'y'>[]) {
  if(p.directed!==e.directed||p.relationId!==e.relationId)return false
  const a=nodes.find(n=>n.id===e.source),b=nodes.find(n=>n.id===e.target)
  const same=(a:typeof nodes[number]|undefined,b:typeof a)=>a?.componentId===p.sourceComponentId&&b?.componentId===p.targetComponentId&&(!p.sourceRole||a?.role===p.sourceRole)&&(!p.targetRole||b?.role===p.targetRole)
  return same(a,b)||!p.directed&&same(b,a)
}
export function validateArchitectureSpec(spec:ArchitectureSpec) {
  keys(spec.content,['components','relations','allowSelfEdges'],['untyped']);keys(spec.validation,['feedbackMode','variants','forbiddenComponents','forbiddenEdges'])
  const {content:c,validation:v}=spec
  list(c.components,20,1);list(c.relations,20)
  if(typeof c.allowSelfEdges!=='boolean'||!['learning','assessment'].includes(v.feedbackMode)||new Set(c.components.map(c=>c?.id)).size!==c.components.length||new Set(c.relations.map(r=>r?.id)).size!==c.relations.length)throw new Error('Неверные настройки схемы')
  for(const r of c.relations){keys(r,['id','label','directed']);if(!id(r.id)||r.id==='untyped'||!text(r.label,120)||typeof r.directed!=='boolean')throw new Error('Неверный тип отношения')}
  if(c.untyped!==undefined){keys(c.untyped,['label','directed']);if(!text(c.untyped.label,120)||typeof c.untyped.directed!=='boolean')throw new Error('Неверное нетипизированное отношение')}
  if(!c.relations.length&&!c.untyped)throw new Error('Нужен хотя бы один вид связи')
  for(const component of c.components) {
    keys(component,['id','label','category','maxInstances','allowedRelations'],['description','icon','roles'])
    if(!id(component.id)||!text(component.label,80)||!text(component.category,80)||!Number.isSafeInteger(component.maxInstances)||component.maxInstances<1||component.maxInstances>20||component.description!==undefined&&!text(component.description)||component.icon!==undefined&&!text(component.icon,20))throw new Error('Неверное описание компонента')
    identifiers(component.allowedRelations,[...c.relations.map(r=>r.id),...(c.untyped?['untyped']:[])])
    if(component.roles!==undefined){list(component.roles,20,1);if(component.maxInstances>component.roles.length||new Set(component.roles.map(r=>r?.id)).size!==component.roles.length)throw new Error('Неверные роли');for(const role of component.roles){keys(role,['id','label']);if(!id(role.id)||!text(role.label,80))throw new Error('Неверная роль')}}
  }
  identifiers(v.forbiddenComponents,c.components.map(c=>c.id));validatePatterns(spec,v.forbiddenEdges);list(v.variants,10,1)
  if(new Set(v.variants.map(v=>v?.id)).size!==v.variants.length)throw new Error('Повторный ID варианта решения')
  let work=0
  for(const variant of v.variants) {
    keys(variant,['id','nodes','edges','extraComponents','extraEdges'])
    if(!id(variant.id))throw new Error('Неверный ID решения')
    validateNodes(spec,variant.nodes,true);if(!variant.nodes.length)throw new Error('Решение должно содержать узлы');validateEdges(spec,variant.edges,variant.nodes)
    identifiers(variant.extraComponents,c.components.map(c=>c.id));validatePatterns(spec,variant.extraEdges)
    if(variant.nodes.some(n=>v.forbiddenComponents.includes(n.componentId))||variant.extraComponents.some(id=>v.forbiddenComponents.includes(id))||variant.edges.some(e=>v.forbiddenEdges.some(p=>patternMatches(p,e,variant.nodes)))||variant.extraEdges.some(p=>v.forbiddenComponents.includes(p.sourceComponentId)||v.forbiddenComponents.includes(p.targetComponentId)||v.forbiddenEdges.some(q=>patternsOverlap(p,q))))throw new Error('Противоречивые требования к схеме')
    let bound=1
    for(const component of c.components){if(component.roles)continue;const required=variant.nodes.filter(n=>n.componentId===component.id).length;for(let i=0;i<required;i++)bound*=component.maxInstances-i}
    work+=bound;if(work>20000)throw new Error('Слишком много перестановок: задайте роли или уменьшите число экземпляров/вариантов')
  }
  if(JSON.stringify(spec.content).length+JSON.stringify(v).length>250000)throw new Error('Слишком большой JSON схемы')
}

export function validateGraphAnswer(spec:ArchitectureSpec,input:unknown):asserts input is GraphAnswer {
  keys(input,['type','graph','undo','closed']);const a=input as GraphAnswer
  if(a.type!=='architecture-builder'||typeof a.closed!=='boolean')throw new Error('Неверное сохранение схемы')
  validateGraph(spec,a.graph);list(a.undo,10);for(const graph of a.undo)validateGraph(spec,graph)
}
export const graphAssessmentKey=(a:GraphAnswer)=>JSON.stringify({nodes:a.graph.nodes.map(n=>[n.id,n.componentId,n.role??null]).sort(),edges:a.graph.edges.map(graphEdgeKey).sort()})
export function replaceGraph(spec:ArchitectureSpec,a:GraphAnswer,graph:Graph):GraphAnswer {
  validateGraph(spec,graph)
  if(JSON.stringify(graph)===JSON.stringify(a.graph))return a
  const next={...a,graph:structuredClone(graph),undo:[...a.undo,structuredClone(a.graph)].slice(-10)}
  return {...next,closed:graphAssessmentKey(next)===graphAssessmentKey(a)?a.closed:false}
}
const nextId=(prefix:string,ids:string[])=>{let n=1;while(ids.includes(`${prefix}-${n}`))n++;return `${prefix}-${n}`}
export function addGraphNode(spec:ArchitectureSpec,a:GraphAnswer,componentId:string,role?:string):GraphAnswer {
  const n=a.graph.nodes.length
  return replaceGraph(spec,a,{...a.graph,nodes:[...a.graph.nodes,{id:nextId('node',a.graph.nodes.map(n=>n.id)),componentId,...(role?{role}:{}),x:(n%4)/3,y:Math.floor(n/4)/5}]})
}
export const moveGraphNode=(spec:ArchitectureSpec,a:GraphAnswer,id:string,x:number,y:number)=>replaceGraph(spec,a,{...a.graph,nodes:a.graph.nodes.map(n=>n.id===id?{...n,x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))}:n)})
export const removeGraphNode=(spec:ArchitectureSpec,a:GraphAnswer,id:string)=>replaceGraph(spec,a,{nodes:a.graph.nodes.filter(n=>n.id!==id),edges:a.graph.edges.filter(e=>e.source!==id&&e.target!==id)})
export const addGraphEdge=(spec:ArchitectureSpec,a:GraphAnswer,edge:Omit<GraphEdge,'id'>)=>replaceGraph(spec,a,{...a.graph,edges:[...a.graph.edges,{...edge,id:nextId('edge',a.graph.edges.map(e=>e.id))}]})
export const removeGraphEdge=(spec:ArchitectureSpec,a:GraphAnswer,id:string)=>replaceGraph(spec,a,{...a.graph,edges:a.graph.edges.filter(e=>e.id!==id)})
export function changeGraphEdge(spec:ArchitectureSpec,a:GraphAnswer,id:string,relationId?:string) {
  const relation=relationDefinition(spec,relationId);if(!relation)throw new Error('Неизвестный вид связи')
  return replaceGraph(spec,a,{...a.graph,edges:a.graph.edges.map(e=>{if(e.id!==id)return e;const {relationId:_old,...rest}=e;return {...rest,...(relationId?{relationId}:{}),directed:relation.directed}})})
}
export function undoGraph(spec:ArchitectureSpec,a:GraphAnswer):GraphAnswer {
  if(!a.undo.length)return a
  const graph=a.undo.at(-1)!;validateGraph(spec,graph)
  const next={...a,graph:structuredClone(graph),undo:a.undo.slice(0,-1)}
  return {...next,closed:graphAssessmentKey(next)===graphAssessmentKey(a)?a.closed:false}
}

export function gradeGraph(spec:ArchitectureSpec,graph:Graph):GraphGrade {
  validateGraph(spec,graph)
  let best:GraphGrade|undefined,bestErrors=Infinity
  for(const variant of spec.validation.variants) {
    const ordered=[...variant.nodes].sort((a,b)=>Number(!!b.role)-Number(!!a.role)),mapping=new Map<string,string>(),used=new Set<string>()
    function assess() {
      const conditions:GraphCondition[]=[],incorrectIds:string[]=[],matchedEdges=new Set<string>()
      for(const n of variant.nodes)conditions.push({id:`node-${n.id}`,label:`Обязательный компонент: ${graphNodeLabel(spec,n)}`,passed:mapping.has(n.id)})
      for(const expected of variant.edges) {
        const translated={...expected,source:mapping.get(expected.source)??'',target:mapping.get(expected.target)??''}
        const found=graph.edges.find(e=>graphEdgeKey(e)===graphEdgeKey(translated))
        if(found)matchedEdges.add(found.id)
        const from=variant.nodes.find(n=>n.id===expected.source)!,to=variant.nodes.find(n=>n.id===expected.target)!
        conditions.push({id:`edge-${expected.id}`,label:`Связь: ${graphNodeLabel(spec,from)} ${expected.directed?'→':'—'} ${graphNodeLabel(spec,to)} · ${relationDefinition(spec,expected.relationId)!.label}`,passed:!!found})
      }
      for(const n of graph.nodes) {
        const forbidden=spec.validation.forbiddenComponents.includes(n.componentId),extra=!used.has(n.id)&&!variant.extraComponents.includes(n.componentId)
        if(forbidden||extra){incorrectIds.push(n.id);conditions.push({id:`extra-${n.id}`,label:`${forbidden?'Запрещённый':'Лишний'} компонент: ${graphNodeLabel(spec,n)}`,passed:false})}
      }
      for(const edge of graph.edges) {
        const forbidden=spec.validation.forbiddenEdges.some(p=>patternMatches(p,edge,graph.nodes)),extra=!matchedEdges.has(edge.id)&&!variant.extraEdges.some(p=>patternMatches(p,edge,graph.nodes))
        if(forbidden||extra){incorrectIds.push(edge.id);conditions.push({id:`wrong-${edge.id}`,label:`${forbidden?'Запрещённая':'Неправильная или лишняя'} связь: ${graphNodeLabel(spec,graph.nodes.find(n=>n.id===edge.source)!)} ${edge.directed?'→':'—'} ${graphNodeLabel(spec,graph.nodes.find(n=>n.id===edge.target)!)} · ${relationDefinition(spec,edge.relationId)!.label}`,passed:false})}
      }
      const errors=conditions.filter(c=>!c.passed).length
      if(errors<bestErrors){bestErrors=errors;best={correct:errors===0,conditions,incorrectIds,variantId:variant.id}}
    }
    function search(index:number) {
      if(bestErrors===0)return
      if(index===ordered.length){assess();return}
      const expected=ordered[index],candidates=graph.nodes.filter(n=>!used.has(n.id)&&n.componentId===expected.componentId&&(!expected.role||n.role===expected.role))
      if(!candidates.length){search(index+1);return}
      for(const actual of candidates){mapping.set(expected.id,actual.id);used.add(actual.id);search(index+1);used.delete(actual.id);mapping.delete(expected.id);if(bestErrors===0)return}
    }
    search(0);if(bestErrors===0)break
  }
  return best!
}
