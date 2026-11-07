import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {assembleExerciseCode,previewDebugCode} from '../src/lib/exercises.ts'
const root=resolve('.tools/aspnet-v2-module15-check');fs.mkdirSync(root,{recursive:true})
const course=JSON.parse(fs.readFileSync('server/course-source/aspnet-core-foundations-v2.json')),m=course.modules.find(m=>m.id==='m15')
const codes=n=>m.lessons[n-1].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).filter(p=>p.kind==='code').map(p=>p.text)
const placements=JSON.parse(fs.readFileSync('server/exercise-source/aspnet-core-foundations-v2.json')).filter(p=>p.moduleId==='m15'),debug=placements.find(p=>p.block.exercise.type==='code-debug').block.exercise,order=placements.find(p=>p.block.exercise.type==='code-order').block.exercise
const command=args=>{const r=spawnSync('dotnet',args,{cwd:root,encoding:'utf8',timeout:120000});if(r.status!==0)throw Error(args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout}
fs.writeFileSync(join(root,'Demo.csproj'),'<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
const usingLines=new Set(['using System.Security.Claims;','using Microsoft.AspNetCore.Authentication;','using Microsoft.AspNetCore.Authentication.Cookies;'])
const clean=s=>s.replace(/^using [A-Za-z][A-Za-z0-9_.]*;\s*/gm,line=>{usingLines.add(line.trim());return ''})
const method=(name,body,args='',async=false)=>`public static ${async?'async Task':'void'} ${name}(${args}){\n${clean(body)}\n}\n`
const login=codes(6)[0],record=login.indexOf('public sealed record')
const sources='public static class SourceSamples{'+
 method('First',codes(1)[0],'string[] args')+method('FirstPolicy',codes(1)[1],'WebApplicationBuilder builder')+
 method('Schemes',codes(2)[0]+'\n'+codes(2)[1],'WebApplicationBuilder builder')+method('Authenticate',codes(2)[2],'HttpContext context',true)+
 method('Claims',codes(3)[0],'string userId,string displayName')+method('Me',codes(3)[1],'WebApplication app')+
 method('Challenge',codes(4)[0],'WebApplication app')+'public static IResult NamedChallenge(){'+clean(codes(4)[1])+'}\n'+
 method('Fifth',codes(5)[0],'string[] args')+method('LoginRoutes',login.slice(0,record)+'\n'+codes(6)[1],'WebApplication app')+
 method('Expiry',codes(7)[0],'WebApplicationBuilder builder')+method('ExplicitExpiry',codes(7)[1],'HttpContext context,ClaimsPrincipal principal',true)+
 method('ValidatePrincipal',codes(8)[0],'CookieAuthenticationOptions options')+method('ApiRoutes',codes(9).join('\n'),'WebApplication app')+
 login.slice(record)+'\npublic sealed record Account(string Id,string DisplayName);public interface IAccountAuthenticator{Task<Account?> VerifyAsync(string login,string password,CancellationToken ct);}}'
const debugMethods=debug.content.fixOptions.map(f=>`public static bool ${f.id.replaceAll('-','_')}(){${clean(previewDebugCode(debug,{type:'code-debug',selection:debug.content.errors[0].location,fixId:f.id})).replace('Console.WriteLine(principal.Identity?.IsAuthenticated);','return principal.Identity?.IsAuthenticated == true;')}}`).join('\n')
const exercise=clean(assembleExerciseCode(order,order.validation.acceptedOrders[0]))
const main=`
var checks = new List<string>();
void Check(bool condition,string name){if(!condition)throw new Exception(name);checks.Add(name);}
Check(DebugCases.cookie_type(),"claims-authentication-type");
Check(!DebugCases.empty_type()&&!DebugCases.null_type()&&!DebugCases.claim_only(),"wrong-debug-fixes-stay-anonymous");
var clock=new TestClock();var sessions=new TestSessions();
var builder=WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:0");builder.Logging.ClearProviders();
builder.Services.AddSingleton<ISessionValidator>(sessions);
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options=>{
 options.TimeProvider=clock;options.Cookie.Name="TestCookie";options.Cookie.HttpOnly=true;options.Cookie.SecurePolicy=CookieSecurePolicy.Always;
 options.LoginPath="/login";options.AccessDeniedPath="/denied";options.ExpireTimeSpan=TimeSpan.FromMinutes(20);options.SlidingExpiration=true;
 SourceSamples.ValidatePrincipal(options);
});
builder.Services.AddAuthorization(options=>options.AddPolicy("Reports",p=>p.RequireAuthenticatedUser().RequireClaim("permission","reports.read")));
await using var app=builder.Build();app.UseAuthentication();app.UseAuthorization();
SourceSamples.ApiRoutes(app);
app.MapGet("/api/reports",()=>TypedResults.Ok("report")).RequireAuthorization("Reports");
app.MapGet("/api/allow",()=>TypedResults.Ok("allow")).RequireAuthorization().AllowCookieRedirect();
app.MapGet("/test/public",()=>"public");
app.MapPost("/test/login",async (HttpContext context)=>{
 var claims=new List<Claim>{new(ClaimTypes.NameIdentifier,"42"),new("session_id","session-one")};
 if(context.Request.Query.ContainsKey("permission"))claims.Add(new("permission","reports.read"));
 await context.SignInAsync(new ClaimsPrincipal(new ClaimsIdentity(claims,CookieAuthenticationDefaults.AuthenticationScheme)),new AuthenticationProperties{IsPersistent=false});
 return Results.NoContent();
});
app.MapPost("/test/logout",async (HttpContext context)=>{await context.SignOutAsync();return Results.NoContent();}).RequireAuthorization();
await app.StartAsync();
using(var scope=app.Services.CreateScope()){
 var rejected=new DefaultHttpContext{RequestServices=scope.ServiceProvider};
 var denied=await LoginEndpoint.Login(new LoginRequest("fixture","fixture"),rejected,new StubAccounts(false),default);
 Check(((IStatusCodeHttpResult)denied).StatusCode==401&&!rejected.Response.Headers.ContainsKey("Set-Cookie"),"exercise-failed-verification-issues-no-cookie");
 var accepted=new DefaultHttpContext{RequestServices=scope.ServiceProvider};
 var signed=await LoginEndpoint.Login(new LoginRequest("fixture","fixture"),accepted,new StubAccounts(true),default);
 Check(((IStatusCodeHttpResult)signed).StatusCode==204&&accepted.Response.Headers.ContainsKey("Set-Cookie"),"exercise-verification-before-cookie-issuance");
}
using var client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){BaseAddress=new Uri(app.Urls.Single())};
async Task<HttpResponseMessage> Send(string path,string? cookie=null,bool post=false){using var request=new HttpRequestMessage(post?HttpMethod.Post:HttpMethod.Get,path);if(cookie is not null)request.Headers.Add("Cookie",cookie);return await client.SendAsync(request);}
string Cookie(HttpResponseMessage r)=>r.Headers.GetValues("Set-Cookie").Single(s=>s.StartsWith("TestCookie=")).Split(';')[0];
using(var r=await Send("/test/public"))Check((int)r.StatusCode==200,"public-anonymous-200");
using(var r=await Send("/api/profile"))Check((int)r.StatusCode==401,"json-api-guest-401");
using(var r=await Send("/welcome"))Check((int)r.StatusCode==302&&r.Headers.Location?.ToString().Contains("/login")==true,"string-guest-302-login");
using(var r=await Send("/legacy-status"))Check((int)r.StatusCode==401,"explicit-disable-401");
using(var r=await Send("/api/allow"))Check((int)r.StatusCode==302,"explicit-allow-302");
using var login=await Send("/test/login",post:true);var cookie=Cookie(login);
Check((int)login.StatusCode==204&&login.Headers.GetValues("Set-Cookie").Any(s=>s.Contains("secure",StringComparison.OrdinalIgnoreCase)&&s.Contains("httponly",StringComparison.OrdinalIgnoreCase)),"cookie-issued-with-flags");
using(var r=await Send("/api/profile",cookie))Check((int)r.StatusCode==200,"valid-cookie-200");
using(var r=await Send("/api/reports",cookie))Check((int)r.StatusCode==403,"missing-permission-403");
using(var privileged=await Send("/test/login?permission=yes",post:true)){using var r=await Send("/api/reports",Cookie(privileged));Check((int)r.StatusCode==200,"trusted-permission-200");}
using(var logout=await Send("/test/logout",cookie,true))Check(logout.Headers.GetValues("Set-Cookie").Any(s=>s.StartsWith("TestCookie=")),"logout-emits-cookie-deletion");
using(var r=await Send("/api/profile",cookie))Check((int)r.StatusCode==200,"copied-ticket-survives-client-logout");
clock.Now=clock.Now.AddMinutes(12);
using(var r=await Send("/api/profile",cookie))Check((int)r.StatusCode==200&&r.Headers.Contains("Set-Cookie"),"sliding-renewal-after-half-window");
sessions.Active=false;
using(var r=await Send("/api/profile",cookie))Check((int)r.StatusCode==401,"server-revocation-rejects-copied-ticket");
sessions.Active=true;clock.Now=clock.Now.AddMinutes(9);
using(var r=await Send("/api/profile",cookie))Check((int)r.StatusCode==401,"original-ticket-expired");
await app.StopAsync();
Console.WriteLine("AUTH_CHECKS="+System.Text.Json.JsonSerializer.Serialize(checks));
`
const types=`public static class DebugCases{${debugMethods}}
public interface ISessionValidator{Task<bool> IsActiveAsync(string id,CancellationToken ct);}
public sealed class TestSessions:ISessionValidator{public bool Active=true;public Task<bool> IsActiveAsync(string id,CancellationToken ct)=>Task.FromResult(Active&&id=="session-one");}
public sealed class TestClock:TimeProvider{public DateTimeOffset Now=new(2026,10,29,12,0,0,TimeSpan.Zero);public override DateTimeOffset GetUtcNow()=>Now;}
public sealed class StubAccounts(bool accepted):IAccountAuthenticator{public Task<VerifiedAccount?> VerifyAsync(string login,string password,CancellationToken ct)=>Task.FromResult(accepted?new VerifiedAccount("42"):null);}`
fs.writeFileSync(join(root,'Program.cs'),[...usingLines].join('\n')+'\n'+main+'\n'+sources+'\n'+exercise+'\n'+types)
command(['restore','--ignore-failed-sources','-v','q']);const build=command(['build','--no-restore','-v','q']);fs.writeFileSync(join(root,'build.txt'),build)
const output=command(['bin/Debug/net10.0/Demo.dll']);fs.writeFileSync(join(root,'runtime.txt'),output)
const checks=JSON.parse(output.match(/AUTH_CHECKS=(\[[^\n]+\])/)[1]);fs.writeFileSync(join(root,'results.json'),JSON.stringify({compiledSourceFences:m.lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).filter(p=>p.kind==='code')).length,localHttpOnly:true,browserHttpsCookieStorageTested:false,checks},null,2))
console.log('Compiled all source fences, code-order and four debug variants. HTTP/claims checks:',checks.length)
