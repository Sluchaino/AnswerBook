import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
const root=resolve('.tools/aspnet-semantic-traces');fs.mkdirSync(root,{recursive:true})
fs.writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>')
const command=args=>{const r=spawnSync('dotnet',args,{cwd:root,encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout}
command(['restore','--ignore-failed-sources','-v','q'])
const placements=JSON.parse(fs.readFileSync('server/exercise-source/aspnet-core-foundations-v2.json')),results=[]
for(const {block:{exercise:e}}of placements.filter(p=>p.block.exercise.type==='code-trace')){
 fs.writeFileSync(join(root,'Program.cs'),e.content.code);command(['build','--no-restore','-v','q'])
 const lines=command(['bin/Debug/net10.0/Demo.dll']).trim().split(/\r?\n/)
 assert.deepEqual(lines,e.content.steps.at(-1).output,e.id)
 for(const s of e.content.steps)assert.deepEqual(lines.slice(0,s.output.length),s.output,e.id+'/'+s.id)
 results.push({id:e.id,output:lines});console.log('Verified real .NET trace:',e.id)
}
fs.writeFileSync(join(root,'results.json'),JSON.stringify(results,null,2))
