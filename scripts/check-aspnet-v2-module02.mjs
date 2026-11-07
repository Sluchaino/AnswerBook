import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {assembleExerciseCode,previewDebugCode} from '../src/lib/exercises.ts'
const root=resolve('artifacts/aspnet-v2-module02-sdk');fs.mkdirSync(root,{recursive:true})
const env={...process.env,DOTNET_CLI_HOME:resolve('artifacts/dotnet-home'),DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_ENVIRONMENT:'Development',ASPNETCORE_ENVIRONMENT:'Development',Catalog__PageSize:'40'}
const command=(args,extra={})=>spawnSync('dotnet',args,{cwd:root,env:{...env,...extra},encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:2000000}),must=(r,label)=>{if(r.status!==0)throw Error(label+'\n'+r.stdout+r.stderr);return r.stdout}
fs.writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>');must(command(['restore','--ignore-failed-sources','-v','q']),'restore')
const settings={Catalog:{PageSize:20,AllowAnonymousBrowse:false},Pagination:{DefaultSize:25,MaximumSize:100},ConnectionStrings:{Main:'Host=example.invalid;Database=teaching-placeholder'},ExternalApi:{ApiKey:'dev-placeholder-only'}}
fs.writeFileSync(join(root,'appsettings.Development.json'),JSON.stringify({Catalog:{PageSize:30,AllowAnonymousBrowse:true}}))
const m=JSON.parse(fs.readFileSync('server/course-source/aspnet-core-foundations-v2.json')).modules.find(m=>m.id==='m02'),cases=[]
const get=(url,status,text)=>`using(var r=await client.GetAsync("${url}")){if((int)r.StatusCode!=${status}${text?`||!(await r.Content.ReadAsStringAsync()).Contains(${JSON.stringify(text)})`:''})throw new Exception("GET ${url}");}`
for(const [i,l]of m.lessons.entries())for(const [j,code]of l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).filter(p=>p.kind==='code'&&p.text.includes('WebApplication.CreateBuilder')&&p.text.includes('app.Run();')).map(p=>p.text).entries()){
 const checks=[get('/time',200,'utc'),j===0?get('/settings',200,'50'):get('/size',200,'15'),get('/configuration',200,'"pageSize":50')+get('/configuration',200,'"browse":true'),j===0?get('/health/basic',200,'ok')+get('/debug/environment',200,'Development'):get('/',200,'Running'),j===0?get('/pagination',200,'25'):j===1?get('/pages/options',200,'100'):get('/options',200,'25'),j===0?get('/integrations/status',200,'true'):get('/status',200,'Configuration loaded'),get('/',200,'Kestrel is serving HTTP'),get('/',200,j===0?'Running':'OK')]
 cases.push({name:`lesson-${i+1}-program-${j+1}`,code,check:checks[i],args:['--Catalog:PageSize=50'],extra:{}})
 if(i===3&&j===0)for(const name of ['Staging','Production'])cases.push({name:'environment-'+name,code,check:get('/health/basic',200,'ok')+get('/debug/environment',404),args:[],extra:{DOTNET_ENVIRONMENT:name,ASPNETCORE_ENVIRONMENT:name}})
 if(i===1&&j===0)cases.push({name:'environment-overrides-json',code,check:get('/settings',200,'40'),args:[],extra:{}})
}
const es=JSON.parse(fs.readFileSync('server/exercise-source/aspnet-core-foundations-v2.json')).filter(p=>p.moduleId==='m02').map(p=>p.block.exercise),order=es.find(e=>e.type==='code-order'),debug=es.find(e=>e.type==='code-debug')
cases.push({name:'exercise-lifetime-reference',code:assembleExerciseCode(order,order.validation.acceptedOrders[0]),check:get('/',200,'Running'),args:[],extra:{}})
for(const f of debug.content.fixOptions)cases.push({name:'validation-'+f.id,code:previewDebugCode(debug,{type:'code-debug',selection:debug.content.errors[0].location,fixId:f.id}),check:get('/pages/options',200,'10'),settings:{...settings,Pagination:{DefaultSize:25,MaximumSize:10}},expectFailure:f.id==='both',args:[],extra:{}})
const results=[]
for(const c of cases){fs.writeFileSync(join(root,'appsettings.json'),JSON.stringify(c.settings??settings));const harness=`app.Urls.Clear();app.Urls.Add("http://127.0.0.1:0");await app.StartAsync();try{var server=app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();var addresses=server.Features.Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>()!;using var client=new HttpClient{BaseAddress=new Uri(addresses.Addresses.Single())};${c.check}Console.WriteLine("SDK_HTTP_OK");}finally{await app.StopAsync();await app.DisposeAsync();}`;fs.writeFileSync(join(root,'Program.cs'),c.code.replace('app.Run();',harness));const build=must(command(['build','--no-restore','-v','q']),c.name+' build'),r=command(['bin/Debug/net10.0/Demo.dll',...c.args],c.extra),output=r.stdout+r.stderr;if(c.expectFailure){if(r.status===0||!output.includes('Invalid pagination configuration.'))throw Error(c.name+' did not reject invalid config')}else{must(r,c.name);if(!output.includes('SDK_HTTP_OK'))throw Error('Missing completion')}
 if(c.name==='exercise-lifetime-reference'){const events=output.split(/\r?\n/).filter(s=>s.startsWith('EVENT_'));if(JSON.stringify(events)!==JSON.stringify(['EVENT_STARTED','EVENT_STOPPING','EVENT_STOPPED']))throw Error('Lifetime order')}
 fs.writeFileSync(join(root,c.name+'.txt'),build+'\n'+output);results.push({name:c.name,passed:true});console.log('SDK/HTTP OK:',c.name)
}
fs.writeFileSync(join(root,'results.json'),JSON.stringify({cases:results},null,2)+'\n');console.log('Verified:',results.length)
