import type {LearningAttempt,LearningCourse} from './learning.ts'
import {scoredLearningQuestions,isLearningCorrect,learningQuestionFingerprint} from './learning.ts'
import {courseRewardPercent} from './economy.ts'

// Only a saved full-course result qualifies; reviews and editable current answers do not.
export function qualifiesForCourseReward(course:LearningCourse,attempt:LearningAttempt) {
  const result=attempt.lastResult,questions=scoredLearningQuestions(course)
  if(!result || result.items.length!==questions.length)return false
  const items=new Map(result.items.map(item=>[item.question.id,item]))
  if(items.size!==questions.length || !questions.every(q=>{const item=items.get(q.id);return item && learningQuestionFingerprint(q)===learningQuestionFingerprint(item.question)}))return false
  const correct=questions.filter(q=>isLearningCorrect(q,items.get(q.id)?.answer)).length
  return correct*100>=questions.length*courseRewardPercent
}
