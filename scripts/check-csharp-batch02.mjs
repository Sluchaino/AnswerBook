// Developer-only content verification. The app and Content API never execute these programs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {assembleExerciseCode,previewDebugCode,validateExercise} from '../src/lib/exercises.ts'
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const all=JSON.parse(readFileSync(source,'utf8')).map(p=>p.block.exercise)
const get=id=>validateExercise(all.find(e=>e.id==='csharp-b02-'+id))
const root=resolve('artifacts/csharp-batch02-sdk');mkdirSync(root,{recursive:true})
writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><LangVersion>14.0</LangVersion><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
writeFileSync(join(root,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>')
const env={...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}
const invoke=args=>spawnSync('dotnet',args,{cwd:root,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:2000000})
const sdk=invoke(['--version']);if(sdk.status!==0)throw new Error(sdk.stderr||'Нужен установленный .NET SDK')
const restore=invoke(['restore','Demo.csproj','--configfile','NuGet.Config','--verbosity','quiet']);if(restore.status!==0)throw new Error(restore.stdout+restore.stderr)
const cases=[],add=(name,code,expected,compileError,runtimeError)=>cases.push({name,code,expected,compileError,runtimeError})
const constructor=get('constructor-chain')
const constructorCode=`var tag = new Tag();
Console.WriteLine(tag.Text);
class Tag
{
    public string Text { get; }
    public Tag() : this("untitled") { Console.WriteLine("outer"); }
    public Tag(string text) { Text = text; Console.WriteLine("inner"); }
}`
for(const part of ['public string Text { get; }','public Tag() : this("untitled") { Console.WriteLine("outer"); }','public Tag(string text) { Text = text; Console.WriteLine("inner"); }'])if(!constructor.description.includes(part))throw new Error('Constructor example diverged from its condition')
add('constructor-chain',constructorCode,'inner\nouter\nuntitled')
const debug=(e,fixId)=>previewDebugCode(e,{type:'code-debug',selection:e.content.errors[0].location,fixId})
const readonly=get('readonly-buffer'),boxing=get('nullable-unboxing'),dict=get('dictionary-missing'),events=get('unsubscribe'),poly=get('virtual-hiding'),closure=get('closure-cell'),generic=get('generic-contract')
add('readonly-original',readonly.content.code,undefined,'CS0191')
for(const [id,out,error] of [['element','9:2'],['replace',undefined,'CS0191'],['clear','0:0'],['other','1:9']])add('readonly-'+id,debug(readonly,id),out,error)
add('readonly-keeps-object',debug(readonly,'element').replace('bag.Numbers[0] = 9;','int[] original = bag.Numbers; bag.Numbers[0] = 9; Console.WriteLine(ReferenceEquals(original, bag.Numbers));'),'True\n9:2')
add('virtual-and-hidden',poly.content.code,'dog\nbase\nderived')
add('virtual-runtime-type',poly.content.code.replace('Dog dog = (Dog)animal;','Dog dog = (Dog)animal; Console.WriteLine(animal.GetType().Name);'),'Dog\ndog\nbase\nderived')
add('hidden-instead-of-override',poly.content.code.replace('override string Speak','new string Speak'),'animal\nbase\nderived')
add('cannot-override-nonvirtual',poly.content.code.replace('new string Describe','override string Describe'),undefined,'CS0506')
add('boxing-original',boxing.content.code,undefined,undefined,'InvalidCastException')
for(const id of boxing.validation.acceptedFixes.problem)add('boxing-'+id,debug(boxing,id),'7')
for(const id of ['nullable-long','double'])add('boxing-'+id,debug(boxing,id),undefined,undefined,'InvalidCastException')
add('nullable-boxing-has-value','int? value = 7; object boxed = value; Console.WriteLine(boxed.GetType() == typeof(int)); Console.WriteLine(((int?)boxed).Value);','True\n7')
add('nullable-boxing-empty','int? value = null; object? boxed = value; Console.WriteLine(boxed is null); Console.WriteLine(((int?)boxed).HasValue);','True\nFalse')
add('null-cannot-unbox-int','object? boxed = null; Console.WriteLine((int)boxed!);',undefined,undefined,'NullReferenceException')
const genericCode=assembleExerciseCode(generic,generic.validation.acceptedOrders[0])
add('generic-contract',genericCode,'A-7')
add('generic-no-new',genericCode.replace('class, IHasCode, new()','class, IHasCode'),undefined,'CS0304')
add('generic-no-interface',genericCode.replace('class, IHasCode, new()','class, new()'),undefined,'CS1061')
add('generic-wrong-constraint-order',genericCode.replace('class, IHasCode, new()','class, new(), IHasCode'),undefined,'CS0401')
const types='class Animal { } class Dog : Animal { }'
add('variance-covariance','IEnumerable<Dog> source = new List<Dog>{new Dog()}; IEnumerable<Animal> target = source; Console.WriteLine(target.Count()); '+types,'1')
add('variance-contravariance','IComparer<Animal> source = Comparer<Animal>.Create((a,b)=>0); IComparer<Dog> target = source; Console.WriteLine(target.Compare(new Dog(),new Dog())); '+types,'0')
add('variance-list-invariant','List<Dog> source = new(); List<Animal> target = source; '+types,undefined,'CS0029')
add('variance-value-types','IEnumerable<int> source = new List<int>(); IEnumerable<object> target = source;',undefined,'CS0266')
add('variance-reverse-enumerable','IEnumerable<Animal> source = new List<Animal>(); IEnumerable<Dog> target = source; '+types,undefined,'CS0266')
add('variance-reverse-comparer','IComparer<Dog> source = Comparer<Dog>.Default; IComparer<Animal> target = source; '+types,undefined,'CS0266')
add('dictionary-original',dict.content.code,undefined,undefined,'KeyNotFoundException')
for(const id of dict.validation.acceptedFixes.problem)for(const [key,out]of [['book','-1'],['pen','4'],['empty','0']]){
 const code=debug(dict,id).replace('string key = "book";','string key = "'+key+'";')
 add(`dictionary-${id}-${key}`,code,out)
}
add('dictionary-zero-not-missing',debug(dict,'zero'),'0')
add('dictionary-count-not-quantity',debug(dict,'count'),'2')
add('dictionary-does-not-insert',debug(dict,'try').replace('Console.WriteLine(quantity);','Console.WriteLine(quantity); Console.WriteLine(stock.Count); Console.WriteLine(stock.ContainsKey(key));'),'-1\n2\nFalse')
add('closure-shared-cell',closure.content.code,'5\n6\n6\n1')
add('closure-independent-copy-control',closure.content.code.replace('Func<int> read = () => count;','int frozen = count; Func<int> read = () => frozen;'),'1\n6\n1\n1')
add('closure-observed-state',closure.content.code.replace('count = 5;','count = 5; Console.WriteLine($"state:{count}:{snapshot}");').replace('Console.WriteLine(next());','Console.WriteLine(next()); Console.WriteLine($"state:{count}:{snapshot}");'),'state:5:1\n5\n6\nstate:6:1\n6\n1')
add('event-original',events.content.code,'AB')
for(const [id,out]of [['saved','B'],['copy','AB'],['second','A'],['add','ABA'],['lambda','AB']])add('event-'+id,debug(events,id),out)
add('event-delegate-equality','Action first = new Action(Handle); Action copy = new Action(Handle); Console.WriteLine(ReferenceEquals(first,copy)); Console.WriteLine(first.Equals(copy)); static void Handle() { }','False\nTrue')
const results=[]
for(const c of cases){
 writeFileSync(join(root,'Program.cs'),c.code)
 const b=invoke(['build','Demo.csproj','--no-restore','--verbosity','quiet']);let log=(b.stdout??'')+(b.stderr??'')
 if(c.compileError){if(b.status===0||!log.includes(c.compileError))throw new Error(c.name+': expected '+c.compileError+'\n'+log)}
 else{if(b.status!==0)throw new Error(c.name+' compile failed\n'+log);const r=invoke(['bin/Debug/net10.0/Demo.dll']);log+='\n'+(r.stdout??'')+(r.stderr??'');if(c.runtimeError){if(r.status===0||!log.includes(c.runtimeError))throw new Error(c.name+': expected '+c.runtimeError+'\n'+log)}else if(r.status!==0||r.stdout.replaceAll('\r\n','\n').trimEnd()!==c.expected)throw new Error(c.name+': unexpected output\n'+log)}
 writeFileSync(join(root,c.name+'.txt'),log);results.push({...c,code:undefined,passed:true});console.log('SDK OK:',c.name)
}
writeFileSync(join(root,'results.json'),JSON.stringify({sdk:sdk.stdout.trim(),framework:'net10.0',language:'14.0',cases:results},null,2)+'\n')
console.log(`Verified ${results.length} fixed teaching cases; no runtime execution added to app.`)
