import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m12-'+id,type,version:1,title,description,instructions:'EF Core 10 / Npgsql. Различайте построение запроса, выполнение SQL и отслеживание сущностей.',feedback:{success:'Верно: решение соответствует условию.',failure:'Проверьте этап выполнения и границы гарантий EF.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const classifier=`using Microsoft.EntityFrameworkCore;
using Npgsql;
public static class SaveFailurePolicy
{
    public static bool IsSkuConflict(DbUpdateException ex)
        => ex.InnerException is PostgresException pg && pg.SqlState == "23503";
}`
const entries=[
 [2,match('query-boundaries','Что выполнит провайдер?', 'Используется IQueryable<Product> от Npgsql. Выберите точную характеристику, не предполагая автоматической авторизации или индексации.',[
 ['compose','К IQueryable последовательно добавлены Where и OrderBy','Строится выражение; SQL ещё не отправлен'],
 ['contains','p.Name.Contains(term) внутри переводимого Where','Фильтр транслируется на сервер; выбор индекса зависит от формы запроса'],
 ['ilike','EF.Functions.ILike(p.Name, prefix + "%")','PostgreSQL-поиск без учёта регистра по LIKE-шаблону'],
 ['helper','В Where вызывается неподдерживаемый пользовательский HasSpecialPrefix','Возможна ошибка трансляции; EF не обязан загружать таблицу для этой проверки'],
 ['tenant','Клиент передал categoryId в query','Этот параметр не заменяет обязательную область доступа пользователя/арендатора']
 ],'IQueryable описывает запрос до терминальной операции. Провайдер переводит поддерживаемые выражения; ILike имеет шаблонную семантику. Правила доступа и эффективность индексов требуют отдельного контроля.')],
 [5,match('tracking-state','Что попадёт в ChangeTracker?', 'Контекст использует обычное snapshot tracking. Сопоставьте действия и последствия; SaveChanges ещё не выполнен, если не указано иначе.',[
 ['tracked','Загруженную tracked-сущность изменили, вызвали DetectChanges','Изменённые свойства могут быть записаны при SaveChangesAsync'],
 ['detached','Изменили объект, полученный AsNoTracking, без Attach/Update','Меняется только объект в памяти; SaveChanges не обнаружит его автоматически'],
 ['dto','Select создал DTO только из скалярных полей, без сущностей','DTO не становится отслеживаемой EF-сущностью'],
 ['identity','AsNoTrackingWithIdentityResolution материализует общие сущности','Дедупликация экземпляров в результате без обычного tracking контекста'],
 ['bulk','ExecuteUpdateAsync изменил строки, часть сущностей уже отслеживается','Tracked-объекты могут остаться со старыми значениями']
 ],'Tracking относится к EF-сущностям, а не любому DTO. Identity resolution без tracking использует отдельный механизм. Bulk SQL обходит обычную синхронизацию ChangeTracker.')],
 [6,{...common('insert-workflow','code-order','Соберите добавление товара','Категория из запроса уже существует; DTO проверен до вызова. Создайте Product, добавьте его в контекст, дождитесь успешного SaveChangesAsync, затем верните 201 и адрес с окончательным ключом.','Add только помечает Added. Ответ с ключом формируется после успешного сохранения; если SaveChanges выбросит исключение, Created не должен выполняться.'),type:'code-order',content:{language:'csharp',prefix:'using Microsoft.EntityFrameworkCore;\npublic static class ProductCommands\n{\n    public static async Task<IResult> Create(CatalogDbContext db, CreateProductRequest request, CancellationToken ct)\n    {',fragments:[
 {id:'create',code:'        var product = new Product { Sku=request.Sku, Name=request.Name, Price=request.Price, CategoryId=request.CategoryId };'},
 {id:'add',code:'        db.Products.Add(product);'},
 {id:'save',code:'        await db.SaveChangesAsync(ct);'},
 {id:'response',code:'        return Results.Created($"/api/products/{product.Id}", new { product.Id, product.Name });'}],suffix:'    }\n}\npublic sealed record CreateProductRequest(string Sku,string Name,decimal Price,int CategoryId);\npublic sealed class Product\n{\n    public int Id {get;set;}\n    public required string Sku {get;set;}\n    public required string Name {get;set;}\n    public decimal Price {get;set;}\n    public int CategoryId {get;set;}\n}\npublic sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options):DbContext(options)\n{\n    public DbSet<Product> Products=>Set<Product>();\n}'},validation:{acceptedOrders:[['create','add','save','response']]}}],
 [8,match('bulk-effects','Обычная запись или прямой SQL?', 'Используется EF Core ExecuteUpdateAsync/ExecuteDeleteAsync. Для нескольких операций общая транзакция не создавалась, если это не указано явно.',[
 ['immediate','Успешно завершился ExecuteUpdateAsync','Изменение уже выполнено; дополнительный SaveChanges для него не нужен'],
 ['count','ExecuteDeleteAsync вернул 0','Под фильтром не удалено ни одной строки; это не автоматическое исключение конкуренции'],
 ['tracker','До bulk-обновления Product уже был загружен tracked-запросом','Значения в этом объекте автоматически не освежаются'],
 ['transaction','Два bulk-запроса должны быть одной атомарной операцией','Нужна явная общая транзакция с обработкой ошибок'],
 ['version','Bulk-операция должна проверять оптимистическую конкуренцию','Включить ожидаемую версию в Where и проверить число затронутых строк']
 ],'Bulk-методы выполняют прямой SQL, обходят tracking и не объединяют независимые вызовы в общую транзакцию. Условия конкуренции и трактовку affected rows задаёт приложение.')],
 [10,{...common('sku-conflict','code-debug','Распознайте только конфликт SKU','IsSkuConflict должен возвращать true только при SQLSTATE 23505 и ConstraintName="UX_products_sku". Для FK, другого уникального ограничения и сетевого сбоя нужен false. Исправьте выражение одной строки; функция не формирует HTTP-ответ и не раскрывает внутренние сообщения.','23505 — unique violation, 23503 — FK violation. SQLSTATE вместе с конкретным constraint позволяет узко классифицировать ожидаемый конфликт, не превращая все ошибки сохранения в 409.'),type:'code-debug',content:{language:'csharp',code:classifier,errors:[{id:'filter',location:{kind:'line',line:6},explanation:'Проверяется FK вместо нужного уникального ограничения.'}],fixOptions:[
 {id:'specific',code:'        => ex.InnerException is PostgresException pg && pg.SqlState == "23505" && pg.ConstraintName == "UX_products_sku";'},
 {id:'unique-only',code:'        => ex.InnerException is PostgresException pg && pg.SqlState == "23505";'},
 {id:'fk',code:'        => ex.InnerException is PostgresException pg && pg.SqlState == "23503";'},
 {id:'all',code:'        => true;'}]},validation:{acceptedFixes:{filter:['specific']}}}]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m12',lessonId:`m12-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module12-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module12 exercises')

