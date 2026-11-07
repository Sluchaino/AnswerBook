import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m09-'+id,type,version:1,title,description,instructions:'ASP.NET Core 10 / .NET 10. Отличайте форму ввода, состояние системы и HTTP-контракт.',feedback:{success:'Верно: решение соответствует условию.',failure:'Проверьте границу ответственности и попробуйте ещё раз.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const debugCode=`using Microsoft.AspNetCore.Diagnostics;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<PublicExceptionHandler>();
var app = builder.Build();
app.UseStatusCodePages();
app.MapGet("/timeout", () => { throw new TimeoutException("Private upstream"); });
app.Run();
public sealed class PublicExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken token)
    {
        if (exception is not TimeoutException) return false;
        context.Response.StatusCode = 503;
        await Results.Problem(statusCode: 503, title: "Temporary service unavailability").ExecuteAsync(context);
        return true;
    }
}`
const entries=[
 [1,match('annotations','Границы проверки DTO','Для MVC включён ApiController, для Minimal API .NET 10 зарегистрирована и работает автоматическая валидация. Сопоставьте механизм и его реальную гарантию.',[
 ['range','ReadingMinutes=0: требуется интервал 1–240','Range(1,240) отклоняет значение при работающей валидации'],
 ['required','Required на свойстве int, значение равно нулю','Ноль не null; Required не задаёт диапазон'],
 ['email','EmailAddress для адреса пользователя','Проверяет формат, не существование почтового ящика'],
 ['new','В коде выполнено new DTO с недопустимым значением','Сам конструктор не запускает DataAnnotations автоматически'],
 ['unique','Два клиента одновременно создают одинаковое имя','Целостность обеспечивает UNIQUE constraint с обработкой конкретного конфликта']
 ],'Атрибуты задают простые правила формы. Их выполняет настроенный pipeline или явный валидатор. Уникальность в условиях гонки требует гарантии хранилища.')],
 [3,match('invariants','Защитите бизнес-инварианты','Выберите механизм под конкретный риск. Успешная предварительная проверка не гарантирует успешную конкурентную запись.',[
 ['snapshot','Два запроса видят Stock=1 до списания','Один атомарный UPDATE с условием Stock >= quantity'],
 ['quantity','Перед ExecuteUpdateAsync клиент прислал quantity=-1','Отклонить неположительное количество до операции'],
 ['transaction','Нужно вместе уменьшить остаток и создать заказ','Общая транзакция и обработка её ошибок'],
 ['unique','Предварительное чтение не нашло занятое имя','UNIQUE constraint остаётся обязательной защитой при вставке'],
 ['provider','При сохранении возникло произвольное DbUpdateException','Не считать любой сбой конфликтом: распознавать конкретное нарушение ограничения']
 ],'Проверка на снимке не атомарна. Условный UPDATE защищает своё изменение, но не все связанные операции; quantity должен быть положительным. Не превращайте ошибки связи с БД в 409.')],
 [5,{...common('validation-problem','code-order','Соберите валидационную проблему','Соберите action POST /api/items. При Min > Max добавьте ошибку поля Max и верните ValidationProblem; иначе верните Ok. Каркас MVC готов.','ValidationProblem(ModelState) формирует 400 и карту ошибок. Запись ошибки должна предшествовать возврату; Ok выполняется только вне ошибочной ветки.'),content:{language:'csharp',prefix:'using Microsoft.AspNetCore.Mvc;\nvar builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddControllers();\nvar app = builder.Build();\napp.MapControllers();\napp.Run();\n[ApiController]\n[Route("api/items")]\npublic sealed class ItemsController : ControllerBase\n{',fragments:[
 {id:'attribute',code:'    [HttpPost]'},
 {id:'method',code:'    public IActionResult Create([FromBody] NewItem input)\n    {'},
 {id:'condition',code:'        if (input.Min > input.Max)\n        {'},
 {id:'error',code:'            ModelState.AddModelError(nameof(input.Max), "Max must not be less than Min");'},
 {id:'problem',code:'            return ValidationProblem(ModelState);'},
 {id:'close-condition',code:'        }'},
 {id:'success',code:'        return Ok();'},
 {id:'close-method',code:'    }'}],suffix:'}\npublic sealed record NewItem(int Min, int Max);'},validation:{acceptedOrders:[['attribute','method','condition','error','problem','close-condition','success','close-method']]}}],
 [6,{...common('exception-pipeline','code-debug','Подключите обработчик исключений','GET /timeout должен вызывать PublicExceptionHandler и возвращать безопасный 503. Класс и сервисы уже зарегистрированы. Замените одну строку middleware перед endpoint.','Регистрация AddExceptionHandler не подключает middleware. UseExceptionHandler перехватывает исключения ниже по конвейеру; StatusCodePages работает с пустыми ошибочными ответами и не заменяет перехват исключений.'),content:{language:'csharp',code:debugCode,errors:[{id:'middleware',location:{kind:'line',line:6},explanation:'Нет ExceptionHandlerMiddleware перед endpoint.'}],fixOptions:[{id:'handler',code:'app.UseExceptionHandler();'},{id:'status',code:'app.UseStatusCodePages();'},{id:'routing',code:'app.UseRouting();'},{id:'cors',code:'app.UseCors();'}]},validation:{acceptedFixes:{middleware:['handler']}}}],
 [9,match('negative-tests','Проверьте причину отказа','Сопоставьте отрицательный сценарий с проверкой, которая подтверждает нужный контракт, а не случайное совпадение статуса.',[
 ['range','Проверяется Range для readingMinutes=0','Корректный JSON/Content-Type, HTTP 400 и errors с ключом ReadingMinutes'],
 ['parse','Проверяется повреждённое JSON-тело','Content-Type application/json и 400 от десериализации, а не бизнес-правила'],
 ['forbidden','Запрещено менять чужой документ','Статус отказа и повторное чтение: состояние документа не изменилось'],
 ['secret','Исключение содержит Password=secret','HTTP 500, безопасное тело без Password=secret и stack trace'],
 ['problem','Клиент получил JSON с status=400','Сверить фактический HTTP-статус, Content-Type и структуру тела']
 ],'Негативный тест должен фиксировать источник отказа и отсутствие запрещённых эффектов. Проверка одного статуса может пройти из-за ошибки на другом этапе запроса.')]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m09',lessonId:`m09-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module09-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module09 exercises')

