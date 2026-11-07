// Fixed teaching examples, executed only by the developer; never imported by app/API.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {validateExercise,previewDebugCode,assembleExerciseCode} from '../src/lib/exercises.ts'
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const all=JSON.parse(readFileSync(source)).map(p=>p.block.exercise),cases=JSON.parse(readFileSync('tests/fixtures/csharp-batch05-sdk-cases.json'))
const get=id=>validateExercise(all.find(e=>e.id==='csharp-b05-'+id))
const root=resolve('artifacts/csharp-batch05-sdk');mkdirSync(root,{recursive:true})
writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
writeFileSync(join(root,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>')
const env={...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}
const invoke=args=>spawnSync('dotnet',args,{cwd:root,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2000000})
const sdk=invoke(['--version']);if(sdk.status!==0)throw new Error(sdk.stderr)
const restored=invoke(['restore','Demo.csproj','--configfile','NuGet.Config','--verbosity','quiet']);if(restored.status!==0)throw new Error(restored.stdout+restored.stderr)
const runs=[],add=(name,code,expected)=>runs.push({name,code,...expected})
const fix=(e,id)=>previewDebugCode(e,{type:'code-debug',selection:e.content.errors[0].location,fixId:id})
for(const c of cases.filter(c=>c.id!=='theory-data')){
 const e=get(c.id)
 if(e.type==='code-order'){for(const [i,order]of e.validation.acceptedOrders.entries())add(c.id+'-'+i,assembleExerciseCode(e,order),{output:c.expected});continue}
 add(c.id+'-original',e.content.code,c.original)
 for(const f of e.content.fixOptions){const accepted=e.validation.acceptedFixes.problem.includes(f.id);add(c.id+'-'+f.id,fix(e,f.id),accepted?{output:c.expected}:c.negative[f.id])}
}
for(const id of ['safe-downcast','required-null','propagate-cancellation','compareexchange-old']){
 const e=get(id),code=fix(e,e.validation.acceptedFixes.problem[0])
 const [from,to,out]=id==='safe-downcast'?['new Animal();','new Dog();','False']:id==='required-null'?['RequiredLength(null)','RequiredLength("abc")','3']:id==='propagate-cancellation'?['cts.Cancel();','// token remains active','completed']:['int state = 5;','int state = 7;','False:7']
 if(!code.includes(from))throw new Error('Control anchor missing '+id);add(id+'-control',code.replace(from,to),{output:out})
}
add('namespace-alias','using Text = System.Text.StringBuilder;\nvar text = new Text(); text.Append("C"); text.Append("#"); Console.WriteLine(text.ToString());',{output:'C#'})
const abstractCode='Console.WriteLine(new CsvReport().Build()); Console.WriteLine(new CsvReport().FileName());\npublic abstract class Report { public abstract string Build(); public virtual string FileName()=>"report.txt"; }\npublic sealed class CsvReport:Report { public override string Build()=>"id;name"; }'
add('abstract-inherited-virtual',abstractCode,{output:'id;name\nreport.txt'})
add('abstract-cannot-instantiate',abstractCode.replace('new CsvReport().Build()','new Report().Build()'),{error:'CS0144'})
add('abstract-requires-implementation',abstractCode.replace('public override string Build()=>"id;name";',''),{error:'CS0534'})
add('composition-constructor','var spy = new Spy(); new Service(spy).Complete(); Console.WriteLine(spy.Messages.Single());\ninterface INotifier { void Notify(string text); }\nsealed class Spy:INotifier { public List<string> Messages {get;}=new(); public void Notify(string text)=>Messages.Add(text); }\nsealed class Service(INotifier notifier) { public void Complete()=>notifier.Notify("ready"); }',{output:'ready'})
add('delegate-contracts','Action<string> print=Console.WriteLine; Func<int,int,bool> less=(a,b)=>a<b; Predicate<int> even=x=>x%2==0; print(less(2,3).ToString()); Console.WriteLine(string.Join(",",new List<int>{1,2,3,4}.FindAll(even)));',{output:'True\n2,4'})
add('predicate-is-not-func','Func<int,bool> f=x=>x%2==0; Predicate<int> p=f;',{error:'CS0029'})
add('attribute-metadata','using System.Reflection;\nConsole.WriteLine(typeof(Service).GetCustomAttribute<FeatureAttribute>()!.Name);\n[AttributeUsage(AttributeTargets.Class,AllowMultiple=false)] public sealed class FeatureAttribute(string name):Attribute { public string Name {get;}=name; }\n[Feature("payments")] public class Service { }',{output:'payments'})
const results=[],normalize=s=>s.replaceAll('\r\n','\n').replace(/\n$/,'')
for(const c of runs){
 if(!c||!['output','error','runtime'].some(k=>Object.hasOwn(c,k)))throw new Error('Missing expectation '+c?.name)
 writeFileSync(join(root,'Program.cs'),c.code)
 const b=invoke(['build','Demo.csproj','--no-restore','--verbosity','quiet']);let log=(b.stdout??'')+(b.stderr??'')
 if(c.error){if(b.status===0||!log.includes(c.error))throw new Error(c.name+' expected '+c.error+'\n'+log)}
 else{if(b.status!==0)throw new Error(c.name+' compile failed\n'+log);const r=invoke(['bin/Debug/net10.0/Demo.dll']);log+='\n'+(r.stdout??'')+(r.stderr??'');if(c.runtime){if(r.status===0||!log.includes(c.runtime))throw new Error(c.name+' expected '+c.runtime+'\n'+log)}else if(r.status!==0||normalize(r.stdout)!==c.output)throw new Error(c.name+' unexpected output '+JSON.stringify(normalize(r.stdout))+' expected '+JSON.stringify(c.output)+'\n'+log)}
 writeFileSync(join(root,c.name+'.txt'),log);results.push({name:c.name,output:c.output,error:c.error,runtime:c.runtime,passed:true});console.log('SDK OK:',c.name)
}
const xr=resolve('artifacts/csharp-batch05-xunit');mkdirSync(xr,{recursive:true})
writeFileSync(join(xr,'csharp-batch05-xunit.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1"/><PackageReference Include="xunit" Version="2.9.3"/><PackageReference Include="xunit.runner.visualstudio" Version="3.1.4"/></ItemGroup></Project>')
writeFileSync(join(xr,'NuGet.Config'),'<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>')
const xrun=args=>spawnSync('dotnet',args,{cwd:xr,env,encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:2000000}),xrestore=xrun(['restore','--configfile','NuGet.Config','--verbosity','quiet']);if(xrestore.status!==0)throw new Error(xrestore.stdout+xrestore.stderr)
const theory=get('theory-data')
for(const [name,code,mode]of [['theory-original',theory.content.code,'invalid'],...theory.content.fixOptions.map(f=>['theory-'+f.id,fix(theory,f.id),f.id==='theory'?'pass':f.id==='skip'?'skipped':'invalid']),['theory-mutant',fix(theory,'theory').replace('n % 2 == 0','true'),'fail']]){
 writeFileSync(join(xr,'UnitTest1.cs'),code);const r=xrun(['test','--no-restore','--verbosity','quiet','--logger',`trx;LogFileName=${name}.trx`,'--results-directory','results']),log=(r.stdout??'')+(r.stderr??'');writeFileSync(join(root,name+'.txt'),log)
 if(mode==='invalid'){if(r.status===0)throw new Error(name+' unexpectedly accepted Fact with parameters')}
 else{const trx=readFileSync(join(xr,'results',name+'.trx'),'utf8');if(mode==='pass'?(r.status!==0||(trx.match(/<UnitTestResult /g)??[]).length!==2||(trx.match(/outcome="Passed"/g)??[]).length!==2):mode==='skipped'?(r.status!==0||!trx.includes('outcome="NotExecuted"')):(r.status===0||!trx.includes('outcome="Failed"')))throw new Error(name+' unexpected xUnit result\n'+log)}
 results.push({name,expected:mode,passed:true});console.log('SDK OK:',name)
}
writeFileSync(join(xr,'UnitTest1.cs'),fix(theory,'theory'))
writeFileSync(join(root,'results.json'),JSON.stringify({sdk:sdk.stdout.trim(),framework:'net10.0',language:'14.0',cases:results},null,2)+'\n')
console.log(`Verified ${results.length} fixed cases; execution remains developer-only.`)
