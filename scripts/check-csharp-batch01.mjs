// Developer-only verification of the fixed batch-01 teaching programs. Never imported by the app/API.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {assembleExerciseCode,previewDebugCode,validateExercise} from '../src/lib/exercises.ts'
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const exercises=JSON.parse(readFileSync(source,'utf8')).map(p=>p.block.exercise),get=id=>validateExercise(exercises.find(e=>e.id===id))
const root=resolve('artifacts/csharp-batch01-sdk');mkdirSync(root,{recursive:true})
writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
writeFileSync(join(root,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>')
const env={...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}
const invoke=args=>spawnSync('dotnet',args,{cwd:root,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2000000})
const sdk=invoke(['--version']);if(sdk.status!==0)throw new Error(sdk.stderr||'Нужен установленный .NET SDK')
const restore=invoke(['restore','Demo.csproj','--configfile','NuGet.Config','--verbosity','quiet']);if(restore.status!==0)throw new Error(restore.stdout+restore.stderr)
const cases=[]
function add(name,code,expected,compileError,runtimeError){cases.push({name,code,expected,compileError,runtimeError})}
const cast=get('csharp-b01-explicit-cast'),index=get('csharp-b01-last-index'),logic=get('csharp-b01-short-circuit'),parameters=get('csharp-b01-value-ref'),ordered=get('csharp-b01-switch-expression')
add('cast-original',cast.content.code,undefined,'CS0266')
for(const [fix,expected,error] of [['truncate','19'],['convert-round','20'],['math-round','20'],['parse-number',undefined,'CS1503']])add('cast-'+fix,previewDebugCode(cast,{type:'code-debug',selection:{kind:'line',line:2},fixId:fix}),expected,error)
add('short-circuit',logic.content.code,'True:1')
add('eager-and-divides-by-zero',logic.content.code.replace(' && ',' & '),undefined,undefined,'DivideByZeroException')
for(const [i,order] of ordered.validation.acceptedOrders.entries())add('switch-accepted-'+(i+1),assembleExerciseCode(ordered,order),'ship')
add('switch-unreachable-arm',assembleExerciseCode(ordered,['head','fallback','new','paid','close']).replace('_ => "review"','_ => "review",'),undefined,'CS8510')
add('value-ref-final',parameters.content.code,'3:11')
let instrumented=parameters.content.code
const changes=[['AddCopy(count);','AddCopy(count); Console.WriteLine($"after-copy:{count}");'],['AddRef(ref count);','AddRef(ref count); Console.WriteLine($"after-ref:{count}");'],['ReplaceCopy(values);','ReplaceCopy(values); Console.WriteLine($"after-copy-array:{values[0]}");'],['ReplaceRef(ref values);','ReplaceRef(ref values); Console.WriteLine($"after-ref-array:{values[0]}");'],['static void AddCopy(int value) { value += 2; }','static void AddCopy(int value) { value += 2; Console.WriteLine($"copy-local:{value}"); }'],['static void AddRef(ref int value) { value += 2; }','static void AddRef(ref int value) { value += 2; Console.WriteLine($"ref-local:{value}"); }'],['    item[0] = 7;','    int[] original = item;\n    item[0] = 7;'],['    item = new[] { 9 };','    item = new[] { 9 };\n    Console.WriteLine($"same-copy-reference:{ReferenceEquals(original, item)}");']]
for(const [before,after] of changes){if(!instrumented.includes(before))throw new Error('Instrumentation anchor missing');instrumented=instrumented.replace(before,after)}
add('value-ref-observed-states',instrumented,'copy-local:3\nafter-copy:1\nref-local:3\nafter-ref:3\nsame-copy-reference:False\nafter-copy-array:7\nafter-ref-array:11\n3:11')
add('index-original',index.content.code,undefined,undefined,'IndexOutOfRangeException')
for(const [values,expected,label] of [['{ 30 }','30','one'],['{ 10, 20, 30 }','30','three'],['{ 4, 5, 6, 7, 8 }','8','five']])for(const fix of index.validation.acceptedFixes.index){const program=previewDebugCode(index,{type:'code-debug',selection:{kind:'line',line:2},fixId:fix}).replace('{ 10, 20, 30 }',values);add(`index-${fix}-${label}`,program,expected)}
add('index-fixed-is-not-general',previewDebugCode(index,{type:'code-debug',selection:{kind:'line',line:2},fixId:'fixed-index'}).replace('{ 10, 20, 30 }','{ 30 }'),undefined,undefined,'IndexOutOfRangeException')
add('index-second-last',previewDebugCode(index,{type:'code-debug',selection:{kind:'line',line:2},fixId:'penultimate'}),'20')
add('index-past-end',previewDebugCode(index,{type:'code-debug',selection:{kind:'line',line:2},fixId:'past-end'}),undefined,undefined,'IndexOutOfRangeException')
const results=[]
for(const entry of cases){writeFileSync(join(root,'Program.cs'),entry.code);const build=invoke(['build','Demo.csproj','--no-restore','--verbosity','quiet']);let log=(build.stdout??'')+(build.stderr??'');if(entry.compileError){if(build.status===0||!log.includes(entry.compileError))throw new Error(entry.name+': expected '+entry.compileError+'\n'+log)}else{if(build.status!==0)throw new Error(entry.name+' compile failed\n'+log);const run=invoke(['bin/Debug/net10.0/Demo.dll']);log+='\n'+(run.stdout??'')+(run.stderr??'');if(entry.runtimeError){if(run.status===0||!log.includes(entry.runtimeError))throw new Error(entry.name+': expected '+entry.runtimeError+'\n'+log)}else if(run.status!==0||run.stdout.replaceAll('\r\n','\n').trimEnd()!==entry.expected)throw new Error(entry.name+': unexpected output\n'+log)}writeFileSync(join(root,entry.name+'.txt'),log);results.push({name:entry.name,passed:true,expected:entry.expected,compileError:entry.compileError,runtimeError:entry.runtimeError});console.log('SDK OK:',entry.name)}
writeFileSync(join(root,'results.json'),JSON.stringify({sdk:sdk.stdout.trim(),framework:'net10.0',language:'14.0',cases:results},null,2)+'\n')
console.log(`Verified ${results.length} preparation cases; code execution is not part of the learning app.`)
