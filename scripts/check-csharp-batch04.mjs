// Developer-only fixed examples. Never imported by the app or Content API.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {validateExercise,previewDebugCode} from '../src/lib/exercises.ts'
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const all=JSON.parse(readFileSync(source,'utf8')).map(p=>p.block.exercise)
const get=id=>validateExercise(all.find(e=>e.id==='csharp-b04-'+id))
const root=resolve('artifacts/csharp-batch04-sdk');mkdirSync(root,{recursive:true})
writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
writeFileSync(join(root,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>')
const env={...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}
const invoke=args=>spawnSync('dotnet',args,{cwd:root,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2000000})
const sdk=invoke(['--version']);if(sdk.status!==0)throw new Error(sdk.stderr||'Нужен .NET SDK')
const restored=invoke(['restore','Demo.csproj','--configfile','NuGet.Config','--verbosity','quiet']);if(restored.status!==0)throw new Error(restored.stdout+restored.stderr)
const cases=[],add=(name,code,expected,compileError,runtimeError)=>cases.push({name,code,expected,compileError,runtimeError})
for(const [id,out]of [['bit-masks','True:False:2'],['null-default','guest::empty'],['matrix-shape','2:3:6:9'],['string-rebind','cat\nbat\nFalse'],['struct-class-copy','2:9:7:7']])add(id,get(id).content.code,out)
add('flags-all-bits-control',get('bit-masks').content.code.replace('int flags = 0b_0001;','int flags = 0b_0011;'),'True:True:2')
add('null-empty-control',get('null-default').content.code.replace('string? name = null;','string? name = "";'),'::empty')
add('null-text-control',get('null-default').content.code.replace('string? name = null;','string? name = "Sam";'),'Sam:Sam:text')
add('matrix-coordinates',get('matrix-shape').content.code+'\nConsole.WriteLine(string.Join(",", matrix.Cast<int>()));\nConsole.WriteLine(matrix.Rank);','2:3:6:9\n1,2,3,4,5,9\n2')
add('matrix-mixed-indexing',get('matrix-shape').content.code.replace('matrix[1, 2] = 9;','matrix[1][2] = 9;'),undefined,'CS0022')
add('string-identity-before',get('string-rebind').content.code.replace('second = second.Replace','Console.WriteLine(ReferenceEquals(first, second));\nsecond = second.Replace'),'True\ncat\nbat\nFalse')
add('struct-values-before-box',get('struct-class-copy').content.code.replace('Box first =','Console.WriteLine($"{a.X}:{b.X}");\nBox first ='),'2:9\n2:9:7:7')
const fix=(e,id)=>previewDebugCode(e,{type:'code-debug',selection:e.content.errors[0].location,fixId:id})
for(const id of ['named-default','generic-inference','extension-null']){
 const e=get(id),accepted=e.validation.acceptedFixes.problem
 const extend=id==='extension-null'?code=>code.replace('public static class TextExtensions','Console.WriteLine("".SafeLength());\nConsole.WriteLine("abc".SafeLength());\npublic static class TextExtensions'):code=>code
 for(const good of accepted)add(`${id}-${good}`,extend(fix(e,good)),id==='named-default'?'ok\nok':id==='generic-inference'?'0':'0\n0\n3')
 if(id==='named-default'){
  add('named-original',e.content.code,undefined,'CS1503')
  add('named-wrong-important',fix(e,'important'),'! ok');add('named-wrong-default',fix(e,'default'),'ok')
 }else if(id==='generic-inference'){
  add('inference-original',e.content.code,undefined,'CS0411');add('inference-object',fix(e,'object'),undefined,'CS0266');add('inference-wrong-value',fix(e,'increment'),'1')
 }else{
  add('extension-original',extend(e.content.code),undefined,undefined,'NullReferenceException')
  add('extension-forgive',fix(e,'forgive'),undefined,undefined,'NullReferenceException')
  add('extension-wrong-default',extend(fix(e,'wrong-default')),'-1\n0\n3')
 }
}
const pattern=get('property-contract'),patternCalls='foreach (Product? item in new Product?[] { null, new(50m, 1), new(100m, 0), new(100m, 1), new(150m, 2) }) Console.WriteLine(IsAvailable(item));\n'
for(const good of pattern.validation.acceptedFixes.problem)add('property-'+good,patternCalls+fix(pattern,good),'False\nFalse\nFalse\nTrue\nTrue')
add('property-original-or',patternCalls+pattern.content.code,'False\nTrue\nTrue\nTrue\nTrue')
add('property-wrong-strict',patternCalls+fix(pattern,'strict'),'False\nFalse\nFalse\nFalse\nTrue')
add('property-wrong-null',patternCalls+fix(pattern,'null'),'True\nFalse\nFalse\nTrue\nTrue')
// This checks the supported allocation APIs, not addresses or collection timing.
add('heap-allocation-apis','byte[] large = new byte[100_000];\nbyte[] pinned = GC.AllocateArray<byte>(128, pinned: true);\npinned[0] = 42;\nConsole.WriteLine(large.Length);\nConsole.WriteLine($"{pinned.Length}:{pinned[0]}");\nSystem.Runtime.GCSettings.LargeObjectHeapCompactionMode = System.Runtime.GCLargeObjectHeapCompactionMode.CompactOnce;\nConsole.WriteLine(System.Runtime.GCSettings.LargeObjectHeapCompactionMode);\nGC.KeepAlive(large); GC.KeepAlive(pinned);','100000\n128:42\nCompactOnce')
const results=[]
for(const c of cases){
 writeFileSync(join(root,'Program.cs'),c.code)
 const b=invoke(['build','Demo.csproj','--no-restore','--verbosity','quiet']);let log=(b.stdout??'')+(b.stderr??'')
 if(c.compileError){if(b.status===0||!log.includes(c.compileError))throw new Error(c.name+': expected '+c.compileError+'\n'+log)}
 else{if(b.status!==0)throw new Error(c.name+' compile failed\n'+log);const r=invoke(['bin/Debug/net10.0/Demo.dll']);log+='\n'+(r.stdout??'')+(r.stderr??'');if(c.runtimeError){if(r.status===0||!log.includes(c.runtimeError))throw new Error(c.name+': expected '+c.runtimeError+'\n'+log)}else if(r.status!==0||r.stdout.replaceAll('\r\n','\n').trimEnd()!==c.expected)throw new Error(c.name+': unexpected output\n'+log)}
 writeFileSync(join(root,c.name+'.txt'),log);results.push({...c,code:undefined,passed:true});console.log('SDK OK:',c.name)
}
// Run the actual supported xUnit package; invalid examples are expected negative cases.
const xr=resolve('artifacts/csharp-batch04-xunit');mkdirSync(xr,{recursive:true})
writeFileSync(join(xr,'csharp-batch04-xunit.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1"/><PackageReference Include="xunit" Version="2.9.3"/><PackageReference Include="xunit.runner.visualstudio" Version="3.1.4"/></ItemGroup></Project>')
writeFileSync(join(xr,'NuGet.Config'),'<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>')
const xrun=args=>spawnSync('dotnet',args,{cwd:xr,env,encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:2000000})
const xrestore=xrun(['restore','--configfile','NuGet.Config','--verbosity','quiet']);if(xrestore.status!==0)throw new Error(xrestore.stdout+xrestore.stderr)
const asyncCheck=get('async-assert')
for(const [name,code,mode]of [
 ...asyncCheck.validation.acceptedFixes.problem.map(id=>['async-'+id,fix(asyncCheck,id),'pass']),
 ['async-wrong-type',fix(asyncCheck,'wrong-type'),'fail'],
 ['async-original',asyncCheck.content.code,'diagnostic'],
 ['async-unawaited',fix(asyncCheck,'unawaited'),'diagnostic'],
 ['async-accepted-detects-missing-throw',fix(asyncCheck,'await').replace('if (id <= 0) throw new ArgumentOutOfRangeException(nameof(id));','_ = id;'),'fail'],
]){
 writeFileSync(join(xr,'UnitTest1.cs'),code)
 const r=xrun(['test','--no-restore','--verbosity','quiet','--logger',`trx;LogFileName=${name}.trx`,'--results-directory','results']),log=(r.stdout??'')+(r.stderr??'')
 writeFileSync(join(root,name+'.txt'),log)
 if(mode==='diagnostic'){if(r.status===0||!/CS0619|xUnit2014|xUnit2021/.test(log))throw new Error(name+' expected diagnostic\n'+log)}
 else{const trx=readFileSync(join(xr,'results',name+'.trx'),'utf8');if(mode==='pass'?(r.status!==0||!trx.includes('outcome="Passed"')):(r.status===0||!trx.includes('outcome="Failed"')))throw new Error(name+' unexpected xUnit result\n'+log)}
 results.push({name,passed:true,expected:mode});console.log('SDK OK:',name)
}
writeFileSync(join(xr,'UnitTest1.cs'),fix(asyncCheck,'await'))
// Verify introductory project claims with actual CLI and generated MSBuild properties.
for(const [name,args,expected]of [
 ['installed-runtimes',['--list-runtimes'],'Microsoft.NETCore.App'],
 ['installed-sdks',['--list-sdks'],sdk.stdout.trim()],
 ['project-properties',['msbuild','Demo.csproj','-getProperty:TargetFramework,OutputType,Nullable,ImplicitUsings'],'net10.0'],
]){const r=invoke(args),log=(r.stdout??'')+(r.stderr??'');writeFileSync(join(root,name+'.txt'),log);if(r.status!==0||!log.includes(expected))throw new Error(name+'\n'+log);results.push({name,passed:true});console.log('SDK OK:',name)}
writeFileSync(join(root,'results.json'),JSON.stringify({sdk:sdk.stdout.trim(),framework:'net10.0',language:'14.0',cases:results},null,2)+'\n')
console.log(`Verified ${results.length} fixed cases; execution stays developer-only.`)
