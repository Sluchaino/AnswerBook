import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
mkdirSync('.tools',{recursive:true});const path='.tools/authoring-token.txt'
if(!existsSync(path))writeFileSync(path,randomBytes(32).toString('hex'),{mode:0o600})
console.log('Редактор: http://127.0.0.1:5193/#/authoring\nКлюч хранится в .tools/authoring-token.txt. Не публикуйте его. API слушает только 127.0.0.1:5129.')
const child=spawn('dotnet',['run','--project','server/AnswerBook.ContentApi','--urls','http://127.0.0.1:5129'],{stdio:'inherit',windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',Authoring__Enabled:'true',Authoring__Token:readFileSync(path,'utf8').trim(),Authoring__Node:process.execPath}})
child.on('exit',code=>{process.exitCode=code??1});process.on('SIGINT',()=>child.kill('SIGINT'))
