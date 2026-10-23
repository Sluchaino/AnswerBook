import catalog from '../data/learning-catalog.json'
import directions from '../data/learning-directions.json'
import readings from '../data/learning-readings.json'
import previousEditions from '../data/learning-previous-editions.json'
import { validateLearningCourse } from './learning'
import type { ReadingSection } from './learning'

export const learningDirections = directions
const data = Object.values(import.meta.glob<unknown>('../data/*-course.json',{eager:true,import:'default'})).map(validateLearningCourse)
export const learningCourses = catalog.map(item => {
  const course = validateLearningCourse(data.find(course => course.id === item.id))
  const library = readings as Record<string, Record<string, ReadingSection[]>>
  const old=previousEditions.find(old=>old.id===course.id)
  return { ...course, ...item, lessons:course.lessons.map(lesson => ({...lesson,reading:library[course.id]?.[lesson.id] ?? []})), previous:old ? validateLearningCourse(old) : undefined }
})
export type LearningCourseDetails = typeof learningCourses[number]
export const learningCourse = learningCourses[0]
