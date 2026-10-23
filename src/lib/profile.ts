export type Course = { id: string; title: string; topicId?: string; learningCourseId?: string }
export type Profession = { id: string; title: string; courses: Course[] }
export type Profile = { version: 1; name: string; professions: Profession[]; completedCourseIds: string[] }

export function emptyProfile(): Profile {
  return { version: 1, name: '', professions: [], completedCourseIds: [] }
}

export function parseProfile(raw: string | null): Profile {
  if (raw === null) return emptyProfile()
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('Неверный профиль')
  const profile = value as Profile
  if (profile.version !== 1 || typeof profile.name !== 'string' || profile.name.length > 80 || !Array.isArray(profile.professions) || profile.professions.length > 100 || !Array.isArray(profile.completedCourseIds)) throw new Error('Неверный профиль')
  const ids = new Set<string>()
  for (const profession of profile.professions) {
    if (!profession || typeof profession.id !== 'string' || !profession.id || ids.has(profession.id) || typeof profession.title !== 'string' || !profession.title.trim() || profession.title.length > 100 || !Array.isArray(profession.courses) || profession.courses.length > 300) throw new Error('Неверная профессия')
    ids.add(profession.id)
    const courseIds = new Set<string>()
    for (const course of profession.courses) {
      if (!course || typeof course.id !== 'string' || !course.id || courseIds.has(course.id) || typeof course.title !== 'string' || !course.title.trim() || course.title.length > 150 || (course.topicId !== undefined && typeof course.topicId !== 'string') || (course.learningCourseId !== undefined && typeof course.learningCourseId !== 'string')) throw new Error('Неверный курс')
      courseIds.add(course.id)
    }
  }
  if (profile.completedCourseIds.some(id => typeof id !== 'string' || !id)) throw new Error('Неверные отметки прохождения')
  return { version: 1, name: profile.name, professions: profile.professions, completedCourseIds: [...new Set(profile.completedCourseIds)] }
}

export function toggleCompleted(profile: Profile, id: string): Profile {
  if (!profile.professions.some(p => p.courses.some(c => c.id === id))) return profile
  return { ...profile, completedCourseIds: profile.completedCourseIds.includes(id) ? profile.completedCourseIds.filter(value => value !== id) : [...profile.completedCourseIds, id] }
}

export function courseProgress(courses: Course[], completed: string[], learning:Record<string,{percent:number;completed:boolean}> = {}) {
  const unique = [...new Map(courses.filter(course => !course.topicId || course.learningCourseId).map(course => [course.id,course])).values()]
  const completedIds = new Set(completed)
  const states=unique.map(course=>{
    const saved=course.learningCourseId ? learning[course.learningCourseId] : undefined
    const done=completedIds.has(course.id) || saved?.completed===true
    return {done,percent:done ? 100 : saved && Number.isFinite(saved.percent) ? Math.max(0,Math.min(100,saved.percent)) : 0}
  })
  return {total:unique.length,done:states.filter(s=>s.done).length,percent:states.length ? Math.round(states.reduce((sum,s)=>sum+s.percent,0)/states.length*100)/100 : 0}
}
