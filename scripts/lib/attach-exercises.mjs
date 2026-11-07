import {validateExercise} from '../../src/lib/exercises.ts'

// Sidecars preserve original Markdown while placing activities at stable block IDs.
export function attachExercises(modules,placements) {
  if(!Array.isArray(placements)||placements.length>1000)throw new Error('Неверный список размещений упражнений')
  const anchors=new Map()
  for(const placement of placements) {
    if(!placement||Object.keys(placement).sort().join(',')!=='afterBlockId,block,lessonId,moduleId')throw new Error('Неверное размещение упражнения')
    const lesson=modules.find(m=>m.id===placement.moduleId)?.lessons.find(l=>l.id===placement.lessonId)
    const block=placement.block
    if(!lesson||!block||block.kind!=='exercise'||Object.keys(block).sort().join(',')!=='exercise,id,kind')throw new Error('Не найден урок упражнения или неверный блок')
    validateExercise(block.exercise)
    const key=`${placement.moduleId}/${placement.lessonId}/${placement.afterBlockId}`
    const anchor=anchors.get(key)??placement.afterBlockId
    const index=lesson.blocks.findIndex(b=>b.id===anchor)
    if(index<0||lesson.blocks.some(b=>b.id===block.id))throw new Error('Не найден якорь или повторный блок упражнения')
    lesson.blocks.splice(index+1,0,structuredClone(block));anchors.set(key,block.id)
  }
  return modules
}
