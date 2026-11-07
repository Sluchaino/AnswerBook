import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m10-'+id,type,version:1,title,description,instructions:'ASP.NET Core 10 / .NET 10. Учитывайте HTTP-контракт и границы учебной реализации.',feedback:{success:'Верно: решение соответствует контракту.',failure:'Сравните условие с HTTP-семантикой и попробуйте ещё раз.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const etagCode=`var app = WebApplication.CreateBuilder(args).Build();
long version = 7;
string title = "Draft";
app.MapPut("/api/tasks/42", (HttpContext http, UpdateTitle request) =>
{
    var currentTag = $"\\"v{version}\\"";
    if (!http.Request.Headers.TryGetValue("If-Match", out var supplied))
        return Results.StatusCode(428);
    if (supplied.Count != 1 || supplied[0] == currentTag)
        return Results.StatusCode(412);
    title = request.Title;
    version++;
    http.Response.Headers.ETag = $"\\"v{version}\\"";
    return Results.Ok(new { title });
});
app.Run();
public sealed record UpdateTitle(string Title);`
const entries=[
 [2,match('method-semantics','Выберите HTTP-семантику','Сопоставьте намерение клиента и метод/результат. Рассматривается публичный контракт, а не конкретная SQL-команда.',[
 ['read','Получить представление задачи без запрошенной бизнес-мутации','GET /api/tasks/42'],
 ['replace','Создать или полностью заменить управляемое состояние по известному URI','PUT /api/tasks/42'],
 ['patch','Применить документ операций replace/remove с указанным форматом','PATCH с application/json-patch+json'],
 ['create','Создать подресурс в коллекции и вернуть его адрес','POST /api/tasks → 201 и Location'],
 ['accepted','Длительная операция принята, но ещё не завершена','202 Accepted со ссылкой на состояние операции']
 ],'GET не должен запрашивать бизнес-мутацию. PUT заменяет состояние целевого URI, PATCH зависит от формата документа. 201 сообщает о создании, 202 — только о принятии.')],
 [3,match('retry-contract','Повторите запрос без двойного эффекта','Для POST /payments API явно поддерживает Idempotency-Key. Восстановите правила договора о повторах, не предполагая автоматической поддержки ASP.NET Core.',[
 ['lost','Ответ потерян после успешного платежа','Повторить ту же логическую операцию с тем же ключом'],
 ['different','Тот же клиент и ключ, но другая сумма','Сравнить отпечаток тела и вернуть предусмотренный контрактом конфликт'],
 ['scope','Два разных пользователя выбрали одинаковую строку ключа','Разделять пространство ключей по проверенному клиенту/арендатору'],
 ['race','Два одинаковых запроса одновременно не нашли сохранённый ключ','Атомарное резервирование и уникальное ограничение, а не check-then-insert'],
 ['delete','DELETE вернул сначала 204, затем 404','Разные ответы совместимы с идемпотентным итоговым эффектом']
 ],'Idempotency-Key требует серверной реализации: область клиента, отпечаток запроса и транзакционная обработка. Одинаковый эффект не означает одинаковые статусы или exactly-once доставку.')],
 [6,{...common('stable-filter','code-order','Соберите стабильную выдачу','Верните только status=open, Priority по убыванию и Id по возрастанию при равных Priority. В JSON оставьте только Id и Title. Учебные данные уже заданы; права доступа находятся за рамками этого примера.','ThenBy(Id) устраняет неоднозначность одинаковых приоритетов. Фильтр допустим перед OrderBy или после ThenBy; проекция выполняется после сортировки, поскольку скрывает Priority и Status.'),type:'code-order',content:{language:'csharp',prefix:'var app = WebApplication.CreateBuilder(args).Build();\nvar tasks = new[] { new TaskRow(2,"B","open",200), new TaskRow(1,"A","open",200), new TaskRow(3,"C","done",1000), new TaskRow(4,"D","open",300) };\napp.MapGet("/api/tasks", () =>\n{',fragments:[
 {id:'start',code:'    var rows = tasks'},
 {id:'filter',code:'        .Where(t => t.Status == "open")'},
 {id:'sort',code:'        .OrderByDescending(t => t.Priority)'},
 {id:'tie',code:'        .ThenBy(t => t.Id)'},
 {id:'select',code:'        .Select(t => new { t.Id, t.Title })'},
 {id:'materialize',code:'        .ToArray();'},
 {id:'return',code:'    return Results.Ok(rows);'}],suffix:'});\napp.Run();\npublic sealed record TaskRow(int Id,string Title,string Status,int Priority);'},validation:{acceptedOrders:[['start','filter','sort','tie','select','materialize','return'],['start','sort','tie','filter','select','materialize','return']]}}],
 [8,{...common('etag-precondition','code-debug','Отклоните устаревшую версию','Исправьте проверку одной строки. Без If-Match нужен 428; с точным актуальным тегом — изменение и новый ETag; с устаревшим тегом — 412 до изменения. Обрабатывается ровно одно простое значение, без полного RFC-парсинга и конкурентной атомарности.','Нужно отклонять несовпадение тега, не совпадение. После успешного обновления версия меняется. Реальная защита от параллельного lost update требует атомарного условия в хранилище.'),type:'code-debug',content:{language:'csharp',code:etagCode,errors:[{id:'comparison',location:{kind:'line',line:9},explanation:'Проверка отклоняет актуальный тег и пропускает устаревший.'}],fixOptions:[
 {id:'different',code:'    if (supplied.Count != 1 || supplied[0] != currentTag)'},
 {id:'equal',code:'    if (supplied.Count != 1 || supplied[0] == currentTag)'},
 {id:'count',code:'    if (supplied.Count != 1)'},
 {id:'never',code:'    if (false)'}]},validation:{acceptedFixes:{comparison:['different']}}}],
 [10,match('openapi-review','Документ или реальное поведение?','Выберите, что обеспечивает каждый механизм .NET 10. Метаданные документации и исполняемая HTTP-логика имеют разные обязанности.',[
 ['services','AddOpenApi и MapOpenApi','Генерация и выдача OpenAPI-документа; UI подключается отдельно'],
 ['produces','Produces(404) у endpoint без ветки NotFound','Описание возможного ответа, без автоматического возврата 404'],
 ['test','HTTP-тест неизвестной задачи','Проверка реального статуса и тела через pipeline'],
 ['rename','В v1 переименовали обязательное name в title без перехода','Breaking change для клиентов, читающих name'],
 ['transformer','Нужно настраивать операцию вместо устаревшего WithOpenApi','OpenAPI operation transformer для изменения документа']
 ],'Документ описывает договор, а интеграционные проверки сопоставляют его с поведением. Produces не исполняет ветки кода; сравнение схем не выявляет все семантические изменения.')]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m10',lessonId:`m10-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module10-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module10 exercises')

