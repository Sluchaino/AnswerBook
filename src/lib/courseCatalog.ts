import type {DownloadedCourse} from './learningDownloads.ts'
import type {CoursePlan} from './coursePlan.ts'
import {validateCoursePlan} from './coursePlan.ts'
import {learningCourseOrder} from './courseStructure.ts'

export type CourseSummary={id:string;version:number;title:string;description:string;direction:string;scope:string;symbol:string;color:string;lessonCount:number;questionCount:number;plan?:CoursePlan;modules:{id:string;title:string;description?:string;contentHash?:string;lessons:{id:string;title:string;contentHash?:string}[];firstStepId?:string}[]}
export function summarizeCourse(course:DownloadedCourse,fingerprint?:(value:unknown)=>string):CourseSummary {
  course=learningCourseOrder(course)
  return {id:course.id,version:course.version,title:course.title,description:course.description,direction:course.direction,scope:course.scope,symbol:course.symbol,color:course.color,
    lessonCount:course.modules?.reduce((n,m)=>n+m.lessons.length,0)??course.lessons.length,
    questionCount:course.lessons.reduce((n,l)=>n+l.questions.length,0),plan:course.plan,
    modules:(course.modules??[]).map(m=>({id:m.id,title:m.title,description:m.description,...(fingerprint?{contentHash:fingerprint(m)}:{}),lessons:m.lessons.map(l=>({id:l.id,title:l.title,...(fingerprint?{contentHash:fingerprint(l)}:{})})),firstStepId:course.lessons.find(l=>l.step?.moduleId===m.id&&l.step.kind==='theory')?.id}))}
}
export function validateCourseSummary(input:unknown):CourseSummary {
  const c=input as CourseSummary
  const text=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=20000
  const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(v)
  if(!c||!id(c.id)||!Number.isSafeInteger(c.version)||c.version<1||![c.title,c.description,c.symbol].every(text)||!id(c.direction)||!['dotnet','python','universal'].includes(c.scope)||!['violet','blue','orange','green','pink','teal'].includes(c.color)||![c.lessonCount,c.questionCount].every(n=>Number.isSafeInteger(n)&&n>=0)||!Array.isArray(c.modules)||c.modules.length>100)throw Error('Неверное описание курса')
  for(const m of c.modules)if(!m||!id(m.id)||!text(m.title)||m.description!==undefined&&!text(m.description)||m.firstStepId!==undefined&&(!text(m.firstStepId)||!/^[-a-z0-9/]+$/.test(m.firstStepId))||!Array.isArray(m.lessons)||m.lessons.length>200||m.lessons.some(l=>!l||!id(l.id)||!text(l.title)))throw Error('Неверная структура курса')
  if(c.plan)validateCoursePlan(c.plan,c.modules)
  // Return only display metadata; never cache theory, answers or exercises in the catalog.
  const hash=(v:unknown)=>v===undefined||typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
  if(c.modules.some(m=>!hash(m.contentHash)||m.lessons.some(l=>!hash(l.contentHash))))throw Error('Неверный отпечаток материала')
  return {id:c.id,version:c.version,title:c.title,description:c.description,direction:c.direction,scope:c.scope,symbol:c.symbol,color:c.color,lessonCount:c.lessonCount,questionCount:c.questionCount,plan:c.plan,modules:c.modules.map(m=>({id:m.id,title:m.title,description:m.description,contentHash:m.contentHash,firstStepId:m.firstStepId,lessons:m.lessons.map(l=>({id:l.id,title:l.title,contentHash:l.contentHash}))}))}
}
