import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m15-'+id,type,version:1,title,description,instructions:'ASP.NET Core 10 / C# 14. Учитывайте схему, доверенность идентичности и границы действия cookie-билета.',feedback:{success:'Верно: механизм и его гарантии определены правильно.',failure:'Проверьте, какую проверку выполняет сервер, и попробуйте снова.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const identityCode=`using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;

var claims = new[] { new Claim(ClaimTypes.NameIdentifier, "42") };
// Учётные данные уже проверены доверенным сервисом.
var identity = new ClaimsIdentity(claims);
var principal = new ClaimsPrincipal(identity);
Console.WriteLine(principal.Identity?.IsAuthenticated);`
const entries=[
 [1,match('auth-boundaries','Личность или право на действие?','Соотнесите задачи с механизмами. Claims и права берутся из проверенного серверного источника.',[
  ['authenticate','Проверить входной билет и установить пользователя','Аутентификация запроса'],
  ['authorize','Допустить к действию только пользователя с permission','Авторизация по политике'],
  ['resource','Проверить владельца уже загруженного заказа','Ресурсная проверка доступа к конкретному объекту'],
  ['anonymous','Сделать endpoint публичным через AllowAnonymous','Снять обязательную авторизацию, не выдавая гостю личность'],
  ['untrusted','Клиент прислал role=admin в произвольном JSON','Недоверенный ввод; сам по себе не даёт серверного разрешения']
 ],'Authentication устанавливает личность, authorization проверяет правило. Даже валидная cookie и наличие имени не подтверждают владение чужим заказом.')],
 [3,{...common('authenticated-identity','code-debug','Почему пользователь остался анонимным?','Проверка учётных данных успешно завершена до этого кода. Требуется создать аутентифицированную identity cookie-схемы, чтобы последняя строка вывела True. Исправьте одну строку, не изменяя claims и проверку результата.','ClaimsIdentity без непустого AuthenticationType остаётся неаутентифицированной. Здесь тип указывается после реальной проверки учётных данных; одно присвоение строки не является проверкой пароля.'),content:{language:'csharp',code:identityCode,errors:[{id:'authentication-type',location:{kind:'line',line:6},explanation:'Конструктор без AuthenticationType создаёт identity с IsAuthenticated=false.'}],fixOptions:[
  {id:'cookie-type',code:'var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);'},
  {id:'empty-type',code:'var identity = new ClaimsIdentity(claims, "");'},
  {id:'null-type',code:'var identity = new ClaimsIdentity(claims, (string?)null);'},
  {id:'claim-only',code:'var identity = new ClaimsIdentity(claims.Append(new Claim("authenticated", "true")));'}
 ]},validation:{acceptedFixes:{'authentication-type':['cookie-type']}}}],
 [6,{...common('issue-cookie','code-order','Соберите безопасный порядок входа','Соберите метод Login. HTTPS, проверка входного DTO и защита от CSRF настроены снаружи; IAccountAuthenticator проверяет пользователя на сервере. При неудаче верните 401. При успехе создайте identity и principal, выдайте cookie и только затем верните 204.','SignInAsync не проверяет пароль: проверка предшествует построению principal. Выдача cookie должна завершиться до возврата успешного результата; билет появится в следующем запросе клиента.'),content:{language:'csharp',prefix:'using System.Security.Claims;\nusing Microsoft.AspNetCore.Authentication;\nusing Microsoft.AspNetCore.Authentication.Cookies;\npublic static class LoginEndpoint\n{\n    public static async Task<IResult> Login(LoginRequest input, HttpContext context, IAccountAuthenticator accounts, CancellationToken ct)\n    {',fragments:[
  {id:'verify',code:'        var account = await accounts.VerifyAsync(input.Login, input.Password, ct);'},
  {id:'deny',code:'        if (account is null) return Results.Unauthorized();'},
  {id:'identity',code:'        var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, account.Id) }, CookieAuthenticationDefaults.AuthenticationScheme);'},
  {id:'principal',code:'        var principal = new ClaimsPrincipal(identity);'},
  {id:'signin',code:'        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, new AuthenticationProperties { IsPersistent = false });'},
  {id:'success',code:'        return Results.NoContent();'}
 ],suffix:'    }\n}\npublic sealed record LoginRequest(string Login, string Password);\npublic sealed record VerifiedAccount(string Id);\npublic interface IAccountAuthenticator\n{\n    Task<VerifiedAccount?> VerifyAsync(string login, string password, CancellationToken ct);\n}'},validation:{acceptedOrders:[['verify','deny','identity','principal','signin','success']]}}],
 [8,match('session-revocation','Что действительно отзывает сеанс?','Работает self-contained cookie без ITicketStore. Если не оговорено иначе, дополнительной серверной проверки версии сеанса нет.',[
  ['logout','Пользователь вышел на A; копия ещё действительного билета осталась у B','Без серверного отзыва копия B может оставаться действительной до истечения срока'],
  ['role','В БД сняли роль, но старый билет ещё не обновлён','Claims старого билета сами по себе не обновятся'],
  ['reject','OnValidatePrincipal увидел отозванный session_id','Отклонить principal и удалить cookie данной схемы'],
  ['cluster','На A сеанс отозван только в локальном словаре; запрос пришёл на B','Для общего отзыва репликам нужно согласованное серверное хранилище'],
  ['cache','Проверять серверную версию раз в пять минут вместо каждого запроса','Снижается нагрузка, но появляется окно задержки отзыва']
 ],'Удаление браузерной cookie, срок действия и отзыв на сервере — разные механизмы. Защищённый билет может быть скопирован; актуальность прав и согласованность реплик проверяются отдельно.')],
 [9,match('api-cookie-responses','Предскажите реакцию cookie handler','ASP.NET Core 10, стандартные события cookie handler, схема настроена, запросы не XHR. Сопоставьте endpoint и отказ. Наличие Location само по себе не означает HTTP 302.',[
  ['api-guest','Гость: защищённый TypedResults.Ok JSON endpoint, стандартные метаданные','401: API-метаданные подавляют login redirect'],
  ['page','Гость: защищённый string endpoint без JSON и дополнительных метаданных','302: обычный маршрут перенаправляет на LoginPath'],
  ['api-forbid','Пользователь вошёл: JSON API требует отсутствующий permission','403: отказ в правах без перенаправления на страницу'],
  ['allow','Гость: JSON API с явным AllowCookieRedirect','302: явное разрешение возвращает login redirect'],
  ['disable','Гость: string endpoint с явным DisableCookieRedirect','401: редирект явно отключён для этого маршрута']
 ],'Реакция зависит от endpoint metadata и выбранной cookie-схемы. Определение API не основано на Accept или одном лишь MapGet. Challenge и Forbid отличаются; выход из сеанса не подчиняется этому правилу редиректов.')]
]
const placements=entries.map(([n,e])=>({moduleId:'m15',lessonId:`m15-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:e.id,kind:'exercise',exercise:validateExercise(e)}}))
fs.writeFileSync('artifacts/aspnet-v2-module15-candidates.json',JSON.stringify(placements,null,2)+'\n')
console.log('Prepared five module15 exercises in five distinct lessons')
