import {authoringCommand} from './lib/authoring-store.mjs'
let input=''
try{for await(const chunk of process.stdin){input+=chunk;if(input.length>2000000)throw new Error('Запрос превышает 2 МБ')}const data=authoringCommand(process.cwd(),JSON.parse(input));process.stdout.write(JSON.stringify({status:200,data}))}
catch(error){process.stdout.write(JSON.stringify({status:error.status??400,error:error.message}));}
