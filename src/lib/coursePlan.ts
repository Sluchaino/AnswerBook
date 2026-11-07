export type CoursePlan = {prerequisites?:string[];modules:{id:string;title:string;description?:string;lessons:{id:string;title:string}[]}[]}
type AvailableModule={id:string;title:string;description?:string;lessons:{id:string;title:string}[]}
export function validateCoursePlan(value:unknown,available:AvailableModule[]):asserts value is CoursePlan {
  const p=value as CoursePlan
  const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=20000
  const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(v)
  if(!p||!Array.isArray(p.modules)||!p.modules.length||p.modules.length>100||p.prerequisites!==undefined&&(!Array.isArray(p.prerequisites)||p.prerequisites.length>30||!p.prerequisites.every(text)))throw Error('Неверный план курса')
  const modules=new Set<string>(),lessons=new Set<string>()
  for(const m of p.modules){
    if(!m||!id(m.id)||modules.has(m.id)||!text(m.title)||m.description!==undefined&&!text(m.description)||!Array.isArray(m.lessons)||!m.lessons.length||m.lessons.length>200)throw Error('Неверный модуль плана')
    modules.add(m.id)
    for(const l of m.lessons){if(!l||!id(l.id)||lessons.has(l.id)||!text(l.title))throw Error('Неверный урок плана');lessons.add(l.id)}
  }
  for(const m of available){const planned=p.modules.find(p=>p.id===m.id);if(!planned||m.lessons.some(l=>!planned.lessons.some(p=>p.id===l.id&&p.title===l.title)))throw Error('Материалы не соответствуют плану курса')}
}
// Availability is based on actual downloaded lessons, never a status in an author's outline.
export function coursePlanModules(course:{modules?:AvailableModule[];plan?:CoursePlan}) {
  const available=course.modules??[]
  return (course.plan?.modules??available).map(m=>{
    const loaded=available.find(a=>a.id===m.id)
    return {...m,description:m.description??loaded?.description,available:!!loaded,lessons:m.lessons.map(l=>({...l,available:!!loaded?.lessons.some(a=>a.id===l.id)}))}
  })
}
