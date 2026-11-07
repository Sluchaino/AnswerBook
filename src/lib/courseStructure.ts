import {validateExercise} from './exercises.ts'
import {validateCoursePlan} from './coursePlan.ts'
import type {CoursePlan} from './coursePlan.ts'
import type {Exercise} from './exercises.ts'
import type {LearningCourse, LearningQuestion, Lesson, ReadingSection} from './learning.ts'

export type TheoryBlock = {id:string;kind:'theory';title:string;content:ReadingSection['content']}
export type LessonTest = {id:string;title:string;questions:LearningQuestion[];passPercent?:number}
export type InlineTest = LessonTest & {kind:'test'}
export type ExerciseBlock={id:string;kind:'exercise';exercise:Exercise}
export type CourseLesson = {id:string;title:string;blocks:(TheoryBlock|InlineTest|ExerciseBlock)[];finalTest:LessonTest}
export type CourseModule = {id:string;title:string;description?:string;lessons:CourseLesson[];exam?:LessonTest}
export type ModularCourseDocument = {
  formatVersion:2;id:string;version:number;title:string;description:string;modules:CourseModule[];plan?:CoursePlan
}
export type CourseStep = {moduleId:string;moduleTitle:string;unitLessonId:string;unitLessonTitle:string;kind:'theory'|'inline-test'|'lesson-test'|'module-test'|'exercise'}

const identifier=(v:unknown):v is string=>typeof v==='string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(v)
const text=(v:unknown):v is string=>typeof v==='string' && !!v.trim() && v.length<=20000

// The authored hierarchy is canonical. Flat steps are derived for navigation,
// saved attempts, scoring and the existing review engine; never authored separately.
export function expandCourseStructure(input:unknown):LearningCourse {
  const course=input as ModularCourseDocument
  if(!course || course.formatVersion!==2 || !Array.isArray(course.modules) || !course.modules.length || course.modules.length>100)throw new Error('Неверные модули курса')
  const exerciseIds=new Set<string>()
  const moduleIds=new Set<string>(),lessonIds=new Set<string>(),lessons:Lesson[]=[]
  for(const module of course.modules) {
    if(!module || !identifier(module.id) || moduleIds.has(module.id) || !text(module.title) || module.description!==undefined && !text(module.description) || !Array.isArray(module.lessons) || !module.lessons.length)throw new Error('Неверный модуль курса')
    moduleIds.add(module.id)
    for(const lesson of module.lessons) {
      if(!lesson || !identifier(lesson.id) || lessonIds.has(lesson.id) || !text(lesson.title) || !Array.isArray(lesson.blocks) || !lesson.blocks.length || lesson.blocks.length>200 || lesson.blocks[0]?.kind!=='theory' || !lesson.blocks.some(b=>b?.kind==='test'))throw new Error('Урок должен начинаться с теории и содержать проверку внутри урока')
      lessonIds.add(lesson.id)
      if(lessonIds.size>2000)throw new Error('Слишком много уроков')
      const blockIds=new Set<string>()
      const step=(id:string,title:string,kind:CourseStep['kind'],questions:LearningQuestion[],content:TheoryBlock['content']=[],exercise?:Exercise)=>{
        if(!identifier(id) || blockIds.has(id) || !text(title))throw new Error('Неверный или повторный шаг урока')
        blockIds.add(id)
        lessons.push({...(exercise?{exercise}:{}),id:`${module.id}/${lesson.id}/${id}`,title,pages:'',theory:[],reading:content.length ? [{title,content,source:'',pages:''}] : [],questions,step:{moduleId:module.id,moduleTitle:module.title,unitLessonId:lesson.id,unitLessonTitle:lesson.title,kind}})
        if(lessons.length>10000)throw new Error('Слишком много шагов курса')
      }
      for(const block of lesson.blocks) {
        if(!block)throw new Error('Неверный шаг урока')
        if(block.kind==='theory') {
          if(!Array.isArray(block.content) || !block.content.length || block.content.length>300 || block.content.some(p=>!p || !['paragraph','heading','code','table'].includes(p.kind) || !text(p.text)))throw new Error('Неверная теория урока')
          step(block.id,block.title,'theory',[],block.content)
        } else if(block.kind==='test') {
          if(!Array.isArray(block.questions) || !block.questions.length)throw new Error('Пустая проверка внутри урока')
          step(block.id,block.title,'inline-test',block.questions)
        } else if(block.kind==='exercise') {
          const exercise=validateExercise(block.exercise)
          if(exerciseIds.has(exercise.id))throw new Error('Повторный ID упражнения в курсе')
          exerciseIds.add(exercise.id)
          step(block.id,exercise.title,'exercise',[],[],exercise)
        } else throw new Error('Неизвестный шаг урока')
      }
      if(!lesson.finalTest || !Array.isArray(lesson.finalTest.questions) || !lesson.finalTest.questions.length)throw new Error('Нужен итоговый тест урока')
      step(lesson.finalTest.id,lesson.finalTest.title,'lesson-test',lesson.finalTest.questions)
    }
    if(module.exam) {
      const exam=module.exam
      if(!identifier(exam.id)||!text(exam.title)||!Array.isArray(exam.questions)||!exam.questions.length||exam.passPercent!==undefined && (!Number.isInteger(exam.passPercent)||exam.passPercent<0||exam.passPercent>100))throw new Error('Неверный контрольный тест модуля')
      lessons.push({id:`${module.id}/exam/${exam.id}`,title:exam.title,pages:'',theory:[],reading:[],questions:exam.questions,step:{moduleId:module.id,moduleTitle:module.title,unitLessonId:'module-exam',unitLessonTitle:'Контрольный тест модуля',kind:'module-test'}})
    }
  }
  if(course.plan!==undefined)validateCoursePlan(course.plan,course.modules)
  return {...course,source:'',lessons}
}

export const stepView=(lesson:Lesson):'theory'|'practice'=>lesson.step && lesson.step.kind!=='theory' ? 'practice' : 'theory'
export const stepCaption=(lesson:Lesson)=>lesson.step?.kind==='exercise' ? 'Интерактивное упражнение' : lesson.step?.kind==='module-test' ? 'Контрольный тест модуля' : lesson.step?.kind==='inline-test' ? 'Проверка в уроке' : lesson.step?.kind==='lesson-test' ? 'Итоговый тест урока' : 'Теория'
export const courseLessonCount=(course:LearningCourse)=>course.modules?.reduce((n,m)=>n+m.lessons.length,0) ?? course.lessons.length

export function lessonTheoryForReview(course:LearningCourse,stepId:string):Lesson|undefined {
  const lesson=course.lessons.find(l=>l.id===stepId)
  if(!lesson?.step)return lesson
  const step=lesson.step
  const theory=course.lessons.filter(l=>l.step?.moduleId===step.moduleId && (step.kind==='module-test' || l.step.unitLessonId===step.unitLessonId) && l.step.kind==='theory')
  return {...lesson,exercise:undefined,title:step.unitLessonTitle,theory:[],questions:[],reading:theory.flatMap(l=>l.reading ?? [])}
}

// Public JSON does not need a second copy of the derived steps.
export function courseDocument<T extends LearningCourse>(course:T):Omit<T,'lessons'>|T {
  if(!course.modules)return course
  const {lessons:_steps,...document}=course
  return {...document,...(course.previous ? {previous:courseDocument(course.previous) as LearningCourse} : {})}
}

// Presentation order leaves authored module and question identities intact.
export function learningCourseOrder<T extends LearningCourse>(course:T):T {
  if(course.id!=='csharp-foundations-v2'||!course.modules?.some(m=>m.id==='m01')||course.modules.length<2)return course
  const modules=[...course.modules.filter(m=>m.id!=='m01'),...course.modules.filter(m=>m.id==='m01')]
  const lessons=modules.flatMap(m=>course.lessons.filter(l=>l.step?.moduleId===m.id))
  return {...course,modules,lessons}
}
