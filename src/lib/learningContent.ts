import {learningCourseOrder} from './courseStructure'
import initialCatalog from '../data/download-catalog.json'
import {validateLearningManifest,purgeRemovedCourses} from './learningDownloads'
import type {DownloadedCourse,LearningBundle} from './learningDownloads'
import {libraryEntries} from './courseLibrary'
import type {LibrarySnapshot,CourseProgressSummary} from './courseLibrary'

export const shippedCatalog=validateLearningManifest(initialCatalog)
export let learningDirections=shippedCatalog.directions
export let learningCourses:DownloadedCourse[]=[]
export let courseCatalog=shippedCatalog.courses
export let savedProgress:Record<string,CourseProgressSummary>={}
export type LearningCourseDetails=DownloadedCourse
export const bundledLearning:LearningBundle={schemaVersion:1,revision:0,directions:learningDirections,courses:[],fingerprints:{}}
let revision=0
const listeners=new Set<()=>void>()
export const subscribeLearning=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const learningContentRevision=()=>revision
export function installLearningBundle(bundle:LearningBundle) {
  learningCourses=purgeRemovedCourses(bundle).courses.map(learningCourseOrder)
  learningDirections=bundle.directions
  revision++;for(const listener of listeners)listener()
}
export function installLibrary(state:LibrarySnapshot){
  courseCatalog=libraryEntries(state);savedProgress=state.progress
  installLearningBundle({...state.installed,directions:state.manifest.directions})
}
