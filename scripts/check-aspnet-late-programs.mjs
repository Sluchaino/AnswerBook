import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'

const root=resolve('.tools/aspnet-late-program-audit');fs.mkdirSync(root,{recursive:true})
const course=JSON.parse(fs.readFileSync('server/course-source/aspnet-core-foundations-v2.json','utf8'))
fs.writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
const run=args=>spawnSync('dotnet',args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:1000000})
const restore=run(['restore','--ignore-failed-sources','-v','q']);if(restore.status!==0)throw Error(restore.stdout+restore.stderr)
const results=[]
const external=/AddJwtBearer|AddOpenIdConnect|AddEntityFrameworkStores|UseNpgsql|AddOpenTelemetry|AddHybridCache|AddStackExchangeRedisCache|AddOpenApi|MapOpenApi|AddStandardResilienceHandler/
for(const m of course.modules.slice(15))for(const l of m.lessons){
 const codes=l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).filter(p=>p.kind==='code')
 for(const [index,p]of codes.entries()){
  if(!p.text.includes('WebApplication.CreateBuilder')||!p.text.includes('app.Run();'))continue
  if(external.test(p.text)){results.push({lesson:l.id,index,status:'external-packages-not-compiled'});continue}
  fs.writeFileSync(join(root,'Program.cs'),p.text)
  const r=run(['build','--no-restore','-v','q'])
  const status=r.status===0?'compiled':'compile-failed'
  fs.writeFileSync(join(root,`${l.id}-${index}.log`),r.stdout+r.stderr)
  results.push({lesson:l.id,index,status,errors:(r.stdout+r.stderr).split(/\r?\n/).filter(s=>s.includes('error '))})
  console.log(l.id,index,status)
 }
}
fs.writeFileSync('artifacts/aspnet-late-program-check.json',JSON.stringify({targetFramework:'net10.0',runtimeExecuted:false,results},null,2)+'\n')
console.log('Counts:',JSON.stringify(results.reduce((map,r)=>(map[r.status]=(map[r.status]??0)+1,map),{})))
