// Synthetic records for engine tests only. Never bundled or published.
const choice=i=>({id:`test-choice-${i}`,kind:'choice',prompt:`Test record ${i}`,options:['A','B','C','D'],correct:0,explanation:'Fixture explanation'})
const output=i=>({id:`test-output-${i}`,kind:'output',prompt:`Test output ${i}`,code:'TEST',answers:['True False'],explanation:'Fixture explanation'})
export const course={id:'test-course',version:2,title:'Test fixture',description:'Engine test data',source:'fixture',lessons:[
 {id:'first',title:'Fixture one',pages:'1',theory:['Fixture text'],questions:Array.from({length:20},(_,i)=>choice(i))},
 {id:'equality',title:'Fixture two',pages:'1',theory:['Fixture text'],questions:[...Array.from({length:18},(_,i)=>choice(i+20)),output(1),output(2)]}
]}
export const previousCourse={...structuredClone(course),version:1,lessons:course.lessons.map(l=>({...structuredClone(l),questions:l.questions.map(q=>({...structuredClone(q),id:q.kind==='choice' ? q.id+'-old' : q.id}))}))}
export const downloadCourse={id:'download-fixture',version:1,title:'Download fixture',description:'Transport test data',source:'fixture',direction:'fundamentals',scope:'universal',symbol:'T',color:'blue',topicIds:[],lessons:[{id:'test',title:'Fixture',pages:'1',theory:['Fixture'],reading:[{title:'Fixture',source:'fixture',pages:'1',content:[{kind:'code',text:'TEST'},{kind:'paragraph',text:'Fixture text'}]}],questions:[{id:'test-output-1',kind:'output',prompt:'Fixture output',code:'TEST',answers:['8'],explanation:'Fixture'}]}]}
