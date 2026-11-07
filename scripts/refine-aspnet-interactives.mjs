import fs from 'node:fs'
import {withContentLock} from './lib/content-lock.mjs'
import {validateExercise} from '../src/lib/exercises.ts'
const base=(type,title,description,explanation)=>({type,title,description,instructions:'Решите задачу по условиям сценария. Для схемы учитывайте тип и направление каждой связи.',feedback:{success:'Решение соответствует сценарию.',failure:'Проверьте условия и попробуйте снова.',explanation}})
function graph(title,description,nodes,edges,why){
 const relations=[...new Set(edges.map(e=>e[2]))].map(id=>({id,label:{calls:'Вызов',exports:'Экспорт телеметрии',depends:'Зависит от контракта',quota:'Проверка квоты',routes:'Передаёт запрос',state:'Чтение/запись состояния'}[id]??id,directed:true}))
 return {...base('architecture-builder',title,description,why),content:{components:nodes.map(([id,label])=>({id,label,category:'Компонент',maxInstances:1,allowedRelations:relations.map(r=>r.id)})),relations,allowSelfEdges:false},validation:{feedbackMode:'learning',variants:[{id:'required',nodes:nodes.map(([id])=>({id,componentId:id})),edges:edges.map(([source,target,relationId],i)=>({id:'e'+i,source,target,relationId,directed:true})),extraComponents:[],extraEdges:[]}],forbiddenComponents:[],forbiddenEdges:[]}}
}
function trace(title,description,code,rows,why){
 const initial={id:'start',phase:'initial',lines:[],title:'До выполнения',variables:[],objects:[],output:[],explanation:'Выполнение ещё не началось.'}
 const steps=rows.map(([line,title,output],i)=>({id:'step'+i,phase:'after',lines:[line],title,variables:[],objects:[],output,explanation:title}))
 const predictions=steps.map((s,i)=>({id:'prediction'+i,atStepId:i?steps[i-1].id:'start',kind:'output',prompt:'Каким станет полный вывод после следующего шага?',correctOptionId:'correct',explanation:s.explanation,options:[{id:'correct',output:s.output},{id:'unchanged',output:i?steps[i-1].output:[]},{id:'other',output:[...(i?steps[i-1].output:[]),'Другой результат']}]}))
 return {...base('code-trace',title,description,why),content:{language:'csharp',code,initial,steps,predictions,defaultMode:'practice'},validation:{completion:'practice'}}
}
function order(title,description,prefix,fragments,suffix,why){return {...base('code-order',title,description,why),content:{language:'csharp',prefix,fragments:fragments.map((code,i)=>({id:'f'+i,code})),suffix},validation:{acceptedOrders:[fragments.map((_,i)=>'f'+i)]}}}
const channelCode=`using System.Threading.Channels;
var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(2) { FullMode = BoundedChannelFullMode.Wait });
Console.WriteLine(channel.Writer.TryWrite("A"));
Console.WriteLine(channel.Writer.TryWrite("B"));
Console.WriteLine(channel.Writer.TryWrite("C"));
Console.WriteLine(channel.Reader.TryRead(out var item) + ":" + item);
Console.WriteLine(channel.Writer.TryWrite("C"));`
const queueRows=[[3,'Принят A: очередь [A]',['True']],[4,'Принят B: очередь [A, B]',['True','True']],[5,'C отклонён: очередь [A, B]',['True','True','False']],[6,'Прочитан A: очередь [B]',['True','True','False','True:A']],[7,'Принят C: очередь [B, C]',['True','True','False','True:A','True']]]
const queueTrace=()=>trace('Предскажите работу bounded Channel','Ёмкость 2, FullMode.Wait; нет параллельных читателей и писателей. TryWrite не ждёт свободного места. Предсказывайте вывод до открытия следующего шага.',channelCode,queueRows,'В режиме Wait неблокирующий TryWrite возвращает false при заполнении. TryRead освобождает одно место. Это не durable очередь.')
const data=()=>({...base('data-transform','Постройте безопасную выборку задач','Текущий пользователь — anna. Оставьте только её завершённые задачи, отсортируйте по Created по убыванию, затем по Id по возрастанию и верните DTO только с Id и Title. Пагинация в этой задаче не применяется.','Фильтры доступа и состояния, стабильная сортировка и проекция выполняются на сервере. Удаление Owner из DTO не заменяет фильтр доступа.'),content:{source:[{Id:4,Owner:'anna',Completed:true,Created:20,Title:'B'},{Id:2,Owner:'bob',Completed:true,Created:30,Title:'Чужая'},{Id:3,Owner:'anna',Completed:false,Created:40,Title:'В работе'},{Id:1,Owner:'anna',Completed:true,Created:20,Title:'A'},{Id:5,Owner:'anna',Completed:true,Created:10,Title:'C'}],schema:{kind:'object',fields:{Id:'number',Owner:'string',Completed:'boolean',Created:'number',Title:'string'}},operations:[{id:'where',type:'filter',title:'Where',fields:['Owner','Completed'],operators:['==','!='],values:['anna','bob',true,false]},{id:'order',type:'order-by',title:'OrderBy',fields:['Created','Id'],directions:['asc','desc']},{id:'then',type:'then-by',title:'ThenBy',fields:['Id'],directions:['asc','desc']},{id:'select',type:'select',title:'Select DTO',fields:['Id','Title','Owner','Created','Completed'],modes:['object']}],target:{kind:'list',items:[{Id:1,Title:'A'},{Id:4,Title:'B'},{Id:5,Title:'C'}]},presentation:'linq'},validation:{order:'ordered',groupOrder:'ordered',maxSteps:8,requiredOperations:['filter','order-by','then-by','select'],forbiddenOperations:[],solution:[{operationId:'where',type:'filter',field:'Owner',operator:'==',value:'anna'},{operationId:'where',type:'filter',field:'Completed',operator:'==',value:true},{operationId:'order',type:'order-by',field:'Created',direction:'desc'},{operationId:'then',type:'then-by',field:'Id',direction:'asc'},{operationId:'select',type:'select',fields:['Id','Title'],mode:'object'}]}})
const edits=[
 ['m16-l09',trace('Повторное предъявление refresh token','Упрощённая модель одноразового refresh token: HashSet представляет уже использованные идентификаторы. Нет параллельных вызовов. В production нужна атомарная запись и политика семей токенов.',`var used = new HashSet<string>();
Console.WriteLine(used.Add("rt-1"));
Console.WriteLine(used.Add("rt-1"));
Console.WriteLine(used.Add("rt-2"));`,[[2,'Первое использование rt-1',['True']],[3,'Повтор rt-1 обнаружен',['True','False']],[4,'Новый rt-2 ещё не использован',['True','False','True']]],'Это модель detection replay, а не OAuth-сервер. Выдача нового токена и отметка использования требуют атомарного протокола; ранее выданный access token автоматически не отзывается.')],
 ['m16-l11',order('Настройте доверенный источник ключей','Соберите конфигурацию JwtBearer. Authority — заранее доверенный сервер с discovery/JWKS; audience фиксирована. Не загружайте ключ по адресу из непроверенного токена. Это фрагмент Program.cs.','using Microsoft.AspNetCore.Authentication.JwtBearer;\nvar builder = WebApplication.CreateBuilder(args);\n',[
 'builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)',
 '    .AddJwtBearer(options =>\n    {',
 '        options.Authority = "https://identity.example.com";',
 '        options.Audience = "tasks-api";',
 '        options.RequireHttpsMetadata = true;',
 '    });'
 ],'\nbuilder.Services.AddAuthorization();','Порядок первых и последних фрагментов задан синтаксисом; Authority, Audience и RequireHttpsMetadata внутри блока независимы и могут переставляться.')],
 ['m17-l09',order('Сброс пароля через Identity','Вызовите ResetPasswordAsync с полученным от пользователя reset token; сам токен проверит Identity. Ответы на неизвестный аккаунт проектируются отдельно без раскрытия наличия пользователя. Соберите тело метода.','using Microsoft.AspNetCore.Identity;\npublic static class ResetFlow {\npublic static async Task<bool> Reset(UserManager<IdentityUser> users, string id, string token, string password) {',[
 'var user = await users.FindByIdAsync(id);','if (user is null) return false;','var result = await users.ResetPasswordAsync(user, token, password);','return result.Succeeded;'
 ],'}}','Identity проверяет токен и правила пароля. Простое присваивание PasswordHash или принятие роли из DTO не является корректным сбросом.')],
 ['m18-l11',graph('Границы доверия upload API','Постройте заданную модель: клиент вызывает API; API проверяет полномочия у сервиса авторизации и сохраняет файл в закрытое хранилище. Все три связи — направленные calls. Клиент не обращается прямо к хранилищу.',[['client','Недоверенный клиент'],['api','Upload API: лимиты и проверка содержимого'],['auth','Проверка права на загрузку'],['store','Закрытое хранилище файлов']],[['client','api','calls'],['api','auth','calls'],['api','store','calls']],'Схема показывает границы и разрешённые направления, но сама по себе не реализует antivirus, CSRF, квоты или проверки владельца.')],
 ['m19-l09',queueTrace()],
 ['m20-l05',graph('Маршрут телеметрии OpenTelemetry','Соберите pipeline без прямых связей SDK с хранилищем: API создаёт spans/metrics, SDK экспортирует OTLP в collector, collector экспортирует в backend.',[['api','API: instrumentation'],['sdk','OpenTelemetry SDK'],['collector','OTLP Collector'],['backend','Telemetry backend']],[['api','sdk','exports'],['sdk','collector','exports'],['collector','backend','exports']],'Collector принимает и обрабатывает телеметрию; он не заменяет инструментацию приложения. Sampling, очереди и редактирование секретов настраиваются отдельно.')],
 ['m21-l07',trace('Miss, hit и инвалидирование кеша','Упрощённая последовательная модель локального кеша; она иллюстрирует hit/miss и invalidation, а не реализует HybridCache или защиту от stampede при конкуренции.',`var cache = new Dictionary<string, int>();
int loads = 0;
int Read() { if (!cache.TryGetValue("item", out var value)) { loads++; value = 7; cache["item"] = value; } return value; }
Console.WriteLine(Read() + ":" + loads);
Console.WriteLine(Read() + ":" + loads);
cache.Remove("item");
Console.WriteLine(Read() + ":" + loads);`,[[4,'Miss: источник прочитан один раз',['7:1']],[5,'Hit: повторного чтения источника нет',['7:1','7:1']],[7,'После invalidation: новый miss',['7:1','7:1','7:2']]],'Удаление записи вызывает новое чтение. При параллельных miss простого Dictionary недостаточно: нужны синхронизация и согласованная политика кеша.')],
 ['m22-l03',graph('Авторизованное вступление в SignalR-группу','В заданном сценарии клиент просит Hub подписаться на проект. Hub вызывает сервис доступа, после разрешения вызывает GroupsManager. Прямой вызов сервиса групп клиентом отсутствует; членство в группе не заменяет авторизацию.',[['client','Клиент'],['hub','Защищённый Hub'],['access','Сервис проверки доступа к проекту'],['groups','GroupsManager']],[['client','hub','calls'],['hub','access','calls'],['hub','groups','calls']],'UserIdentifier берётся из доверенного principal. Произвольный projectId или знание имени группы не подтверждают право подписки.')],
 ['m23-l04',order('Соберите тест с fake-зависимостью','Тест проверяет прикладной сервис без HTTP и БД: fake возвращает цену 10, сервис вычисляет сумму. Соберите Arrange → Act → Assert. Это самостоятельный пример xUnit.','using Xunit;\npublic sealed class PriceTests {\n[Fact] public void CalculatesTotal() {',[
 'var prices = new FakePrices();',
 'var service = new TotalService(prices);',
 'var total = service.Calculate(3);',
 'Assert.Equal(30m, total);'
 ],'} }\npublic interface IPrices { decimal UnitPrice(); }\npublic sealed class FakePrices : IPrices { public decimal UnitPrice() => 10m; }\npublic sealed class TotalService(IPrices prices) { public decimal Calculate(int count) => prices.UnitPrice() * count; }','Fake изолирует тест от внешней системы. Такой тест не доказывает корректность SQL, JWT handler или HTTP-контракта.')],
 ['m24-l01',graph('Направление зависимостей слоёв','Модель с отдельным Domain и контрактами в Application: Api вызывает Application; Application зависит от Domain; Infrastructure реализует контракты Application и использует Domain. Покажите compile-time зависимости. Composition root вынесен за рамки схемы.',[['api','Api'],['application','Application: use cases и контракты'],['domain','Domain: инварианты'],['infra','Infrastructure: EF Core и реализации']],[['api','application','depends'],['application','domain','depends'],['infra','application','depends'],['infra','domain','depends']],'Domain не зависит от ASP.NET Core или EF Core. Это одна выбранная модель, а не обязательное количество проектов для любого приложения.')],
 ['m25-l06',graph('Kestrel за reverse proxy','Выбран TLS termination на nginx: клиент передаёт HTTPS-запрос proxy, proxy направляет запрос Kestrel, API обращается к PostgreSQL. Клиент и proxy не соединяются с БД. Все связи calls.',[['client','Клиент HTTPS'],['proxy','nginx: TLS termination'],['api','Kestrel / Tasks.Api'],['db','PostgreSQL']],[['client','proxy','calls'],['proxy','api','calls'],['api','db','calls']],'Схема не заменяет настройки TLS и доверенных Forwarded Headers. Внутренний участок сети защищается согласно модели угроз.')],
 ['m26-l05',queueTrace()],
 ['m26-l06',graph('Глобальная квота трёх реплик','Все запросы идут через gateway, который аутентифицирует пользователя и проверяет атомарный общий счётчик. Затем gateway направляет запрос одной из трёх реплик. На схеме покажите все допустимые направления. При сбое хранилища выбран fail closed.',[['client','Клиент'],['gateway','Gateway: auth и global quota'],['store','Общее атомарное хранилище квот'],['api1','API 1: local limiter'],['api2','API 2: local limiter'],['api3','API 3: local limiter']],[['client','gateway','calls'],['gateway','store','quota'],['gateway','api1','routes'],['gateway','api2','routes'],['gateway','api3','routes']],'Три независимых локальных лимита не дают строгую общую квоту. Обратный результат вызова хранилища подразумевается вызовом, отдельное обратное ребро не требуется.')],
 ['m27-l10',data()]
]
// Accept every ordering of independent assignments within the JwtBearer options block.
const jwks=edits.find(([id])=>id==='m16-l11')[1]
jwks.validation.acceptedOrders=[[2,3,4],[2,4,3],[3,2,4],[3,4,2],[4,2,3],[4,3,2]].map(order=>['f0','f1',...order.map(i=>'f'+i),'f5'])
withContentLock(()=>{
 const path='server/exercise-source/aspnet-core-foundations-v2.json',all=JSON.parse(fs.readFileSync(path))
 for(const [lessonId,patch]of edits){const p=all.find(p=>p.lessonId===lessonId);if(!p)throw Error('Нет интерактива '+lessonId);const old=p.block.exercise;if(Object.entries(patch).every(([k,v])=>JSON.stringify(old[k])===JSON.stringify(v)))continue;p.block.exercise=validateExercise({...old,...patch,version:old.version+1})}
 fs.writeFileSync(path,JSON.stringify(all,null,2)+'\n')
})
console.log('Refined',edits.length,'exercises for their lesson goals')
