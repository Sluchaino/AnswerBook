import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m08-'+id,type,version:1,title,description,instructions:'ASP.NET Core 10 / .NET 10, MVC-контроллеры. Различайте маршрут, binding, валидацию и фактический результат action.',feedback:{success:'Верно: решение соответствует условию.',failure:'Проверьте условие и попробуйте ещё раз.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const code=`using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();
[Produces("application/json")]
[Route("api/notes")]
public sealed class NotesController : ControllerBase
{
    [HttpPost]
    public ActionResult<object> Create(CreateNote request) => Ok(new { request.Title });
}
public sealed record CreateNote([param: Required][param: StringLength(80,MinimumLength=2)] string Title);`
const entries=[
 [3,match('attribute-paths','Какой адрес у action?', 'Контроллер имеет [Route("api/tasks")]. Есть только GET-actions из условия; POST не зарегистрирован. Для числового action используется {id:int}.',[
 ['list','Action с [HttpGet] без собственного шаблона','GET /api/tasks'],['item','Action с [HttpGet("{id:int}")] и Id=7','GET /api/tasks/7'],['absolute','Action с [HttpGet("/health/task-api")]','GET /health/task-api без префикса api/tasks'],['method','POST /api/tasks при наличии только GET-action этого пути','405 Method Not Allowed'],['constraint','GET /api/tasks/not-int при отсутствии другого подходящего шаблона','404: ограничение int не выполнено']
 ],'Относительный шаблон объединяется с префиксом контроллера, абсолютный начинается от корня. Ограничение маршрута работает до привязки int: неподходящий путь обычно даёт 404, неподходящий метод — 405.')],
 [4,{...common('automatic-modelstate','code-debug','Активируйте автоматический 400','Исправьте атрибут над контроллером. Пустой Title, строка из одного символа и строка длиннее 80 должны давать 400 до action. Корректный Title даёт 200. Регистрация и отображение контроллеров уже выполнены.','ApiController включает автоматическую проверку ModelState. Produces задаёт формат, ApiExplorerSettings управляет видимостью в документации, а ResponseCache — настройками кеширования: они не заменяют это поведение.'),type:'code-debug',content:{language:'csharp',code,errors:[{id:'attribute',location:{kind:'line',line:8},explanation:'Атрибут формата не включает поведение ApiController.'}],fixOptions:[{id:'api',code:'[ApiController]'},{id:'produces',code:'[Produces("application/json")]'},{id:'explorer',code:'[ApiExplorerSettings(IgnoreApi = true)]'},{id:'cache',code:'[ResponseCache(NoStore = true)]'}]},validation:{acceptedFixes:{attribute:['api']}}}],
 [6,{...common('actionresult','code-order','Соберите ActionResult<T>','Соберите GET /api/products/{id:int}: для Id=5 верните ProductDto с 200, для остальных целых — 404. Каркас приложения и контроллера задан.','ActionResult<ProductDto> допускает DTO и HTTP-результаты. Здесь Ok(product) даёт 200 с телом, NotFound — 404. Сам generic-тип не выбирает успешную ветку автоматически.'),type:'code-order',content:{language:'csharp',prefix:'using Microsoft.AspNetCore.Mvc;\nvar builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddControllers();\nvar app = builder.Build();\napp.MapControllers();\napp.Run();\n[ApiController]\n[Route("api/products")]\npublic sealed class ProductsController : ControllerBase\n{',fragments:[{id:'attribute',code:'    [HttpGet("{id:int}")]'},{id:'method',code:'    public ActionResult<ProductDto> Get(int id)\n    {'},{id:'lookup',code:'        ProductDto? product = id == 5 ? new(5, "Pencil") : null;'},{id:'result',code:'        return product is null ? NotFound() : Ok(product);'},{id:'close',code:'    }'}],suffix:'}\npublic sealed record ProductDto(int Id,string Name);'},validation:{acceptedOrders:[['attribute','method','lookup','result','close']]}}],
 [7,match('negotiation','Как формируется представление ответа?', 'Рассматривается MVC. Если сказано «только JSON», XML-форматтер не зарегистрирован; ReturnHttpNotAcceptable=true и RespectBrowserAcceptHeader=true.',[
 ['json','Ok(object), Accept: application/json','200 и JSON-представление объекта'],['xml','Ok(object), Accept: application/xml при поддержке только JSON','406 Not Acceptable'],['text','Content("v2", "text/plain")','Явный текстовый ContentResult с Content-Type text/plain'],['null','AddJsonOptions с WhenWritingNull','Null-свойства не записываются при JSON-сериализации'],['metadata','ProducesResponseType(204) указан у action','Метаданные ответа; реальный статус всё равно определяет возвращаемый результат']
 ],'Content negotiation выбирает поддерживаемое представление для ObjectResult. ContentResult задаёт формат явно. Метаданные документации сами по себе не заменяют Ok/NoContent/NotFound в коде.')],
 [8,match('filter-boundaries','Что может MVC-фильтр?', 'Выберите поведение по контракту фильтра. Условие не заменяет production-аутентификацию и авторизацию демонстрационным заголовком.',[
 ['timing','IAsyncActionFilter вызывает next в try и логирует в finally','Внешний код может измерить длительность выполнения action'],['gate','HeaderGateFilter задаёт BadRequestObjectResult и не вызывает next','Action не выполняется; возвращается результат фильтра'],['exception','IExceptionFilter перехватил InvalidOperationException, задал ConflictObjectResult и ExceptionHandled=true','Обработанное исключение преобразуется в 409'],['outside','Ошибка возникла в middleware до входа в MVC','MVC exception filter не является обработчиком всего HTTP-конвейера'],['continue','Action filter вызывает await next() и не заменяет результат','Выполнение продолжается к остальным фильтрам/action']
 ],'Action filters работают внутри MVC, могут оборачивать action и завершать выполнение до него. Exception filters имеют ограниченную область. Для общего перехвата ошибок HTTP-конвейера используется соответствующая middleware-инфраструктура.')]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m08',lessonId:`m08-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module08-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module08 exercises')

