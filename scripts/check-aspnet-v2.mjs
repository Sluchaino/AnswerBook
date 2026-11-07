import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {assembleExerciseCode,previewDebugCode} from '../src/lib/exercises.ts'
const c=JSON.parse(fs.readFileSync('server/course-source/aspnet-core-foundations-v2.json')),root=resolve('artifacts/aspnet-v2-sdk');fs.mkdirSync(root,{recursive:true})
const command=args=>spawnSync('dotnet',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:90000,env:{...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1'},maxBuffer:2000000}),must=(r,name)=>{if(r.status!==0)throw Error(name+'\n'+r.stdout+r.stderr);return r.stdout}
fs.writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
must(command(['restore','--ignore-failed-sources','--verbosity','quiet']),'restore')
const cases=[],get=(p,s,text)=>`using(var r=await client.GetAsync("${p}")){if((int)r.StatusCode!=${s}${text?`||!(await r.Content.ReadAsStringAsync()).Contains(${JSON.stringify(text)})`:''})throw new Exception("GET ${p}");}`
for(const [i,l]of c.modules[0].lessons.entries())for(const [j,code]of l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).filter(p=>p.kind==='code'&&p.text.includes('WebApplication.CreateBuilder')&&p.text.includes('app.Run();')).map(p=>p.text).entries()){
 let check
 if(i===0)check=get('/',200,'Hello from ASP.NET Core')
 if(i===1)check=get('/tasks/7',200,'Read')+get('/tasks/missing',404)
 if(i===2)check=get('/',200,'OK')
 if(i===4)check=j===0?get('/',200,'ready'):get('/visits',200,'"visits":1')+get('/visits',200,'"visits":2')
 if(i===5)check=j===0?get('/tasks',200,'Read HTTP'):j===1?get('/tasks/1',200,'Read HTTP')+get('/tasks/999',404)+get('/tasks/nope',404):'using(var r=await client.PostAsJsonAsync("/tasks",new{title=" Learn "})){if((int)r.StatusCode!=201||r.Headers.Location?.ToString()!="/tasks/10"||!(await r.Content.ReadAsStringAsync()).Contains("Learn"))throw new Exception("POST created");}using(var r=await client.PostAsJsonAsync("/tasks",new{title=" "})){if((int)r.StatusCode!=400)throw new Exception("POST invalid");}'
 if(i===6)check=j===0?get('/echo?message=hello',200,'hello')+get('/echo',200,'(empty)')+'using(var r=await client.PostAsJsonAsync("/echo",new{text="from-client"})){if((int)r.StatusCode!=200||!(await r.Content.ReadAsStringAsync()).Contains("from-client"))throw new Exception("POST echo");}':get('/check',200,'ok')
 cases.push({name:`lesson-${i+1}-program-${j+1}`,code,check})
}
const exercises=JSON.parse(fs.readFileSync('server/exercise-source/aspnet-core-foundations-v2.json')).map(p=>p.block.exercise)
const order=exercises.find(e=>e.type==='code-order');cases.push({name:'exercise-host-reference',code:assembleExerciseCode(order,order.validation.acceptedOrders[0]),check:get('/visits',200,'"visits":1')})
const debug=exercises.find(e=>e.type==='code-debug')
for(const f of debug.content.fixOptions){const status={created:201,ok:200,empty:204,missing:404}[f.id];cases.push({name:'exercise-fix-'+f.id,code:previewDebugCode(debug,{type:'code-debug',selection:debug.content.errors[0].location,fixId:f.id}),check:`using(var r=await client.PostAsJsonAsync("/tasks",new{title="Learn"})){if((int)r.StatusCode!=${status})throw new Exception("Fix status");${f.id==='created'?'if(r.Headers.Location?.ToString()!="/tasks/10")throw new Exception("Location");':''}}`})}
const results=[]
for(const x of cases){
 const harness=`app.Urls.Clear();app.Urls.Add("http://127.0.0.1:0");await app.StartAsync();try{var server=app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();var addresses=server.Features.Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>()!;using var client=new HttpClient{BaseAddress=new Uri(addresses.Addresses.Single())};${x.check}Console.WriteLine("SDK_HTTP_OK");}finally{await app.StopAsync();await app.DisposeAsync();}`
 fs.writeFileSync(join(root,'Program.cs'),'using System.Net.Http.Json;\n'+x.code.replace('app.Run();',harness))
 const build=must(command(['build','--no-restore','--verbosity','quiet']),x.name+' build'),output=must(command(['bin/Debug/net10.0/Demo.dll']),x.name+' runtime')
 if(!output.includes('SDK_HTTP_OK'))throw Error('Missing completion')
 if(x.name==='lesson-3-program-1'){const actual=output.split(/\r?\n/).filter(s=>/^[AB]: (before|after)$/.test(s));if(JSON.stringify(actual)!==JSON.stringify(['A: before','B: before','B: after','A: after']))throw Error('Middleware order')}
 fs.writeFileSync(join(root,x.name+'.txt'),build+'\n'+output);results.push({name:x.name,passed:true});console.log('SDK/HTTP OK:',x.name)
}
fs.writeFileSync(join(root,'results.json'),JSON.stringify({sdk:must(command(['--version']),'version').trim(),cases:results},null,2)+'\n');console.log('Verified:',results.length)
