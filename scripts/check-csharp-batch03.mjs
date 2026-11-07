// Developer-only content verification. The app and Content API never execute these programs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {assembleExerciseCode,validateExercise} from '../src/lib/exercises.ts'
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const all=JSON.parse(readFileSync(source,'utf8')).map(p=>p.block.exercise)
const get=id=>validateExercise(all.find(e=>e.id==='csharp-b03-'+id))
const root=resolve('artifacts/csharp-batch03-sdk');mkdirSync(root,{recursive:true})
writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
writeFileSync(join(root,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>')
const env={...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}
const invoke=args=>spawnSync('dotnet',args,{cwd:root,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2000000})
const sdk=invoke(['--version']);if(sdk.status!==0)throw new Error(sdk.stderr||'Нужен установленный .NET SDK')
const restore=invoke(['restore','Demo.csproj','--configfile','NuGet.Config','--verbosity','quiet']);if(restore.status!==0)throw new Error(restore.stdout+restore.stderr)
const cases=[],add=(name,code,expected,compileError,runtimeError)=>cases.push({name,code,expected,compileError,runtimeError})
const linq=get('deferred-snapshot'),using=get('using-dispose'),aaa=get('aaa-wallet'),any=get('whenany-pending'),race=get('lost-update'),sem=get('semaphore-owner'),span=get('span-view-copy'),withRecord=get('record-shallow')
add('linq-current-and-snapshot',linq.content.code,'2,3,4\n2,3')
add('linq-predicate-timing',linq.content.code.replace('source.Where(x => x > 1)','source.Where(x => { Console.WriteLine("visit:" + x); return x > 1; })'),'visit:1\nvisit:2\nvisit:3\nvisit:1\nvisit:2\nvisit:3\nvisit:4\n2,3,4\n2,3')
add('linq-eager-control',linq.content.code.replace('source.Where(x => x > 1)','source.Where(x => x > 1).ToArray()'),'2\n2')
const usingCode=`try
{
    using (var resource = new DemoResource())
    {
        Console.WriteLine("body");
        throw new InvalidOperationException();
    }
}
catch (InvalidOperationException) { Console.WriteLine("catch"); }
finally { Console.WriteLine("finally"); }
Console.WriteLine("after");
sealed class DemoResource : IDisposable
{
    public DemoResource() { Console.WriteLine("open"); }
    public void Dispose() { Console.WriteLine("dispose"); }
}`
for(const text of ['throw new InvalidOperationException()','Console.WriteLine("catch")','Console.WriteLine("finally")'])if(!using.description.includes(text))throw new Error('Using scenario diverged from its condition')
add('using-dispose-before-catch',usingCode,'open\nbody\ndispose\ncatch\nfinally\nafter')
add('using-outer-declaration-control',`using var resource = new DemoResource();
try { Console.WriteLine("body"); throw new InvalidOperationException(); }
catch (InvalidOperationException) { Console.WriteLine("catch"); }
finally { Console.WriteLine("finally"); }
Console.WriteLine("after");
sealed class DemoResource : IDisposable
{
 public DemoResource() { Console.WriteLine("open"); }
 public void Dispose() { Console.WriteLine("dispose"); }
}`,'open\nbody\ncatch\nfinally\nafter\ndispose')
add('using-failed-construction',`try { using var r = new Resource(); }
catch (InvalidOperationException) { Console.WriteLine("catch"); }
sealed class Resource : IDisposable {
 public Resource() { Console.WriteLine("construct"); throw new InvalidOperationException(); }
 public void Dispose() { Console.WriteLine("dispose"); }
}`,'construct\ncatch')
const boundary='foreach (int age in new[] { 17, 18, 65, 66 }) Console.WriteLine(CanRegister(age)); static bool CanRegister(int age) => age >= 18 && age <= 65;'
add('boundary-contract',boundary,'False\nTrue\nTrue\nFalse')
for(const [name,from,to,out]of [['below','age >= 18','age >= 17','True\nTrue\nTrue\nFalse'],['lower','age >= 18','age > 18','False\nFalse\nTrue\nFalse'],['upper','age <= 65','age < 65','False\nTrue\nFalse\nFalse'],['above','age <= 65','age <= 66','False\nTrue\nTrue\nTrue']])add('boundary-mutant-'+name,boundary.replace(from,to),out)
add('whenany-pending',any.content.code,'10\nFalse\n20')
add('whenany-faulted-winner',any.content.code.replace('first.SetResult(10);','first.SetException(new InvalidOperationException());').replace('Console.WriteLine(await winner);','try { Console.WriteLine(await winner); } catch (InvalidOperationException) { Console.WriteLine("observed"); }'),'observed\nFalse\n20')
add('whenany-cancelled-winner',any.content.code.replace('first.SetResult(10);','first.SetCanceled();').replace('Console.WriteLine(await winner);','try { Console.WriteLine(await winner); } catch (OperationCanceledException) { Console.WriteLine("cancelled"); }'),'cancelled\nFalse\n20')
add('race-controlled-lost-update',race.content.code,'1')
let observed=race.content.code.replace('int counter = 0;','int counter = 0; int leftObserved = -1, rightObserved = -1;').replace('int read = counter;','int read = counter; leftObserved = read;')
const second=observed.indexOf('int read = counter;',observed.indexOf('leftObserved = read;'))
if(second<0)throw new Error('Race observation anchor missing')
observed=observed.slice(0,second)+observed.slice(second).replace('int read = counter;','int read = counter; rightObserved = read;')
observed=observed.replace('Console.WriteLine(counter);','Console.WriteLine($"reads:{leftObserved}:{rightObserved}"); Console.WriteLine(counter);')
add('race-both-local-reads-zero',observed,'reads:0:0\n1')
add('race-atomic-control',race.content.code.replaceAll('counter = read + 1;','Interlocked.Increment(ref counter);'),'2')
const semCode=assembleExerciseCode(sem,sem.validation.acceptedOrders[0]),method=semCode.slice(semCode.indexOf('static async Task UseAsync'))
add('semaphore-success',semCode,'work\n1')
const cancelled=count=>`using var gate = new SemaphoreSlim(${count}, 1);
using var cts = new CancellationTokenSource(); cts.Cancel();
try { await UseAsync(gate, cts.Token); } catch (OperationCanceledException) { Console.WriteLine("cancelled"); }
Console.WriteLine(gate.CurrentCount);
${method}`
add('semaphore-cancelled-empty',cancelled(0),'cancelled\n0')
add('semaphore-cancelled-available',cancelled(1),'cancelled\n1')
add('semaphore-cancel-during-wait',`using var gate = new SemaphoreSlim(0, 1);
using var cts = new CancellationTokenSource();
Task pending = UseAsync(gate, cts.Token);
Console.WriteLine(pending.IsCompleted); cts.Cancel();
try { await pending; } catch (OperationCanceledException) { Console.WriteLine("cancelled"); }
Console.WriteLine(gate.CurrentCount);
${method}`,'False\ncancelled\n0')
add('semaphore-work-throws',`using var gate = new SemaphoreSlim(1, 1);
try { await UseAsync(gate, CancellationToken.None); } catch (InvalidOperationException) { Console.WriteLine("caught"); }
Console.WriteLine(gate.CurrentCount);
${method.replace('Console.WriteLine("work");','throw new InvalidOperationException();')}`,'caught\n1')
const wrongWait=cancelled(0).replace('await gate.WaitAsync(token);\n    try\n    {','try\n    {\n        await gate.WaitAsync(token);')
if(wrongWait===cancelled(0))throw new Error('Semaphore mutation anchor missing')
add('semaphore-incorrect-release-control',wrongWait,'cancelled\n1')
add('span-view-copy',span.content.code,'1,20,3,4\n2,99')
add('span-offset-length',span.content.code.replace('int[] copy = values[1..3];','int[] copy = values[1..3]; Console.WriteLine($"{view.Length}:{view[0]}:{copy.Length}");'),'2:2:2\n1,20,3,4\n2,99')
add('span-readonly-rejects-write',span.content.code.replace('Span<int> view','ReadOnlySpan<int> view'),undefined,'CS8331')
add('span-cannot-box',span.content.code.replace('view[0] = 20;','object boxed = view;'),undefined,'CS0029')
add('record-shallow',withRecord.content.code,'old:new\n1,2\nFalse\nTrue')
add('record-explicit-list-copy-control',withRecord.content.code.replace('with { Name = "new" }','with { Name = "new", Items = new List<int>(first.Items) }'),'old:new\n1\nFalse\nFalse')
// A pure graph traversal checks the exercise's abstract reachability, never forces GC timing.
add('reachability-abstract-graph',`var edges = new Dictionary<string, string[]> { ["root"] = ["A"], ["A"] = ["B"], ["B"] = ["C"], ["C"] = [], ["D"] = ["E"], ["E"] = ["D"] };
var reachable = new HashSet<string>(); var queue = new Queue<string>(); queue.Enqueue("root");
while (queue.TryDequeue(out string? item)) if (reachable.Add(item)) foreach (var target in edges[item]) queue.Enqueue(target);
Console.WriteLine(string.Join(",", new[]{"A","B","C","D","E"}.Where(reachable.Contains)));
Console.WriteLine(string.Join(",", new[]{"A","B","C","D","E"}.Where(x => !reachable.Contains(x))));`,'A,B,C\nD,E')
const results=[]
for(const c of cases){
 writeFileSync(join(root,'Program.cs'),c.code)
 const b=invoke(['build','Demo.csproj','--no-restore','--verbosity','quiet']);let log=(b.stdout??'')+(b.stderr??'')
 if(c.compileError){if(b.status===0||!log.includes(c.compileError))throw new Error(c.name+': expected '+c.compileError+'\n'+log)}
 else{if(b.status!==0)throw new Error(c.name+' compile failed\n'+log);const r=invoke(['bin/Debug/net10.0/Demo.dll']);log+='\n'+(r.stdout??'')+(r.stderr??'');if(c.runtimeError){if(r.status===0||!log.includes(c.runtimeError))throw new Error(c.name+': expected '+c.runtimeError+'\n'+log)}else if(r.status!==0||r.stdout.replaceAll('\r\n','\n').trimEnd()!==c.expected)throw new Error(c.name+': unexpected output\n'+log)}
 writeFileSync(join(root,c.name+'.txt'),log);results.push({...c,code:undefined,passed:true});console.log('SDK OK:',c.name)
}
// Versions come from the installed .NET 10 xUnit template; isolated developer project only.
const xr=resolve('artifacts/csharp-batch03-xunit');mkdirSync(xr,{recursive:true})
writeFileSync(join(xr,'csharp-batch03-xunit.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1"/><PackageReference Include="xunit" Version="2.9.3"/><PackageReference Include="xunit.runner.visualstudio" Version="3.1.4"/></ItemGroup></Project>')
writeFileSync(join(xr,'NuGet.Config'),'<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>')
const xrun=args=>spawnSync('dotnet',args,{cwd:xr,env,encoding:'utf8',timeout:120000,windowsHide:true,maxBuffer:2000000})
const xrestore=xrun(['restore','--configfile','NuGet.Config','--verbosity','quiet']);if(xrestore.status!==0)throw new Error('xUnit restore failed\n'+xrestore.stdout+xrestore.stderr)
for(const [i,order]of aaa.validation.acceptedOrders.entries()){
 writeFileSync(join(xr,'UnitTest1.cs'),assembleExerciseCode(aaa,order))
 const name='xunit-accepted-'+(i+1),r=xrun(['test','--no-restore','--verbosity','quiet','--logger',`trx;LogFileName=${name}.trx`,'--results-directory','results'])
 writeFileSync(join(root,name+'.txt'),(r.stdout??'')+(r.stderr??''))
 const trx=readFileSync(join(xr,'results',name+'.trx'),'utf8')
 if(r.status!==0||!trx.includes('outcome="Passed"'))throw new Error('xUnit accepted test failed\n'+r.stdout+r.stderr)
 results.push({name,passed:true,expected:'One actual xUnit test passes'});console.log('SDK OK:',name)
}
const mutant=assembleExerciseCode(aaa,aaa.validation.acceptedOrders[0]).replace('if (sum <= 0 || sum > Balance) return false;','if (sum <= 0) return false; if (sum > Balance) { Balance -= sum; return false; }')
writeFileSync(join(xr,'UnitTest1.cs'),mutant)
const mutantResult=xrun(['test','--no-restore','--verbosity','quiet','--logger','trx;LogFileName=xunit-mutant.trx','--results-directory','results'])
writeFileSync(join(root,'xunit-rejects-mutant.txt'),(mutantResult.stdout??'')+(mutantResult.stderr??''))
if(mutantResult.status===0||!readFileSync(join(xr,'results','xunit-mutant.trx'),'utf8').includes('outcome="Failed"'))throw new Error('xUnit failed to detect balance mutation')
results.push({name:'xunit-rejects-mutant',passed:true,expected:'xUnit rejects false status with changed balance'});console.log('SDK OK: xunit-rejects-mutant')
writeFileSync(join(xr,'UnitTest1.cs'),assembleExerciseCode(aaa,aaa.validation.acceptedOrders[0]))
writeFileSync(join(root,'results.json'),JSON.stringify({sdk:sdk.stdout.trim(),framework:'net10.0',language:'14.0',cases:results},null,2)+'\n')
console.log(`Verified ${results.length} fixed cases including actual xUnit; no code execution added to learning app.`)
