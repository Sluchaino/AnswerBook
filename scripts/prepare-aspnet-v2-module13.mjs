import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m13-'+id,type,version:1,title,description,instructions:'EF Core 10 / Npgsql. Учитывайте границы ChangeTracker, транзакции и фактического выполнения SQL.',feedback:{success:'Верно: решение соответствует условию.',failure:'Проверьте границы гарантий и попробуйте ещё раз.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const versionCode=`using Microsoft.EntityFrameworkCore;
public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options):DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>().Property(p => p.Version)
            .IsConcurrencyToken(false);
    }
}
public sealed class Product
{
    public int Id {get;set;}
    public string Name {get;set;} = "";
    public Guid Version {get;set;} = Guid.NewGuid();
}`
const entries=[
 [2,match('identity-fixup','Один ключ — один tracked-экземпляр','Сопоставьте ситуацию и поведение EF. Fixup работает с объектами, уже известными контексту; дополнительные запросы явно не выполнялись.',[
 ['duplicate','Контекст уже отслеживает Product Id=7; пытаются Attach другого Product Id=7','Конфликт двух экземпляров одного ключа в этом DbContext'],
 ['fixup','Category и Product с подходящим FK уже отслеживаются','EF согласует известные FK и навигации без загрузки всех строк категории'],
 ['resolution','AsNoTrackingWithIdentityResolution материализует граф','Временная дедупликация экземпляров результата без tracking основного контекста'],
 ['filtered','Tracking filtered Include после загрузки дорогих товаров той же категории','Fixup может добавить в навигацию ранее отслеженные товары вне фильтра'],
 ['clear','После выполненного SQL вызвали ChangeTracker.Clear()','Объекты отсоединяются; уже выполненный SQL не откатывается']
 ],'Identity resolution относится к ключам отслеживаемых сущностей. Fixup не является запросом на полную загрузку. Clear меняет состояние контекста, а не состояние зафиксированной БД.')],
 [6,match('single-split','Выберите стратегию чтения графа','У Category есть две sibling-коллекции: 10 Products и 10 Tags. Требования к снимку данных оцениваются отдельно от формы SQL.',[
 ['fanout','Один SQL JOIN двух независимых коллекций по 10 элементов','Возможны 100 строк на категорию с повторением данных корня'],
 ['split','AsSplitQuery загружает эти коллекции','Несколько команд вместо одного multiplicative JOIN'],
 ['snapshot','Между командами split другая транзакция добавляет строки','Единый снимок автоматически не гарантирован; важен isolation level'],
 ['projection','Для API нужны только имя категории и число товаров','Проекция с серверным Count вместо загрузки всего графа'],
 ['measure','Выбирают single или split для production','Измерить roundtrips, строки, трафик и p95 на сопоставимых данных']
 ],'Split query — стратегия выполнения, а не уровень изоляции. Single сокращает roundtrips, но может многократно дублировать данные. Выбор определяется конкретным запросом и измерениями.')],
 [7,{...common('transaction-workflow','code-order','Соберите атомарную операцию','Сначала откройте транзакцию, выполните условное уменьшение цены, проверьте changed==1. Только затем добавьте категорию и сохраните её, после чего выполните Commit. При исключении нужен Rollback и повторное выбрасывание. Вызов предполагает проверенные id и права; retry здесь не включён.','Одна явная транзакция объединяет bulk-команду и SaveChanges. Commit следует только после успешной проверки и сохранения. Обработчик ошибки не должен скрывать исключение.'),type:'code-order',content:{language:'csharp',prefix:'using Microsoft.EntityFrameworkCore;\npublic static class CatalogOperations\n{\n    public static async Task Change(CatalogDbContext db,int id,CancellationToken ct)\n    {',fragments:[
 {id:'begin',code:'        await using var transaction = await db.Database.BeginTransactionAsync(ct);'},
 {id:'try',code:'        try\n        {'},
 {id:'update',code:'            int changed = await db.Products.Where(p => p.Id == id && p.Price >= 10m)\n                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Price, p => p.Price - 10m), ct);'},
 {id:'check',code:'            if (changed != 1) throw new InvalidOperationException("Товар недоступен");'},
 {id:'save',code:'            db.Categories.Add(new Category { Name="Новая группа" });\n            await db.SaveChangesAsync(ct);'},
 {id:'commit',code:'            await transaction.CommitAsync(ct);'},
 {id:'catch',code:'        }\n        catch\n        {\n            await transaction.RollbackAsync(ct);\n            throw;\n        }'}],suffix:'    }\n}\npublic sealed class Product{public int Id{get;set;}public decimal Price{get;set;}}\npublic sealed class Category{public int Id{get;set;}public required string Name{get;set;}}\npublic sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options):DbContext(options)\n{\n    public DbSet<Product> Products=>Set<Product>();\n    public DbSet<Category> Categories=>Set<Category>();\n}'},validation:{acceptedOrders:[['begin','try','update','check','save','commit','catch']]}}],
 [9,{...common('version-token','code-debug','Включите проверку исходной версии','Для Guid Version требуется app-managed concurrency token. Исправьте одну строку модели. Приложение отдельно должно менять Guid при каждом обновлении; никакой конфигурационный флаг не сделает это автоматически.','IsConcurrencyToken включает проверку исходной версии при сохранении. ValueGeneratedNever и обязательность свойства не включают concurrency. Guid из этого задания не является PostgreSQL xmin.'),type:'code-debug',content:{language:'csharp',code:versionCode,errors:[{id:'token',location:{kind:'line',line:7},explanation:'Проверка конкуренции явно отключена.'}],fixOptions:[{id:'concurrency',code:'            .IsConcurrencyToken();'},{id:'disabled',code:'            .IsConcurrencyToken(false);'},{id:'required',code:'            .IsRequired();'},{id:'generated',code:'            .ValueGeneratedNever();'}]},validation:{acceptedFixes:{token:['concurrency']}}}],
 [12,match('streaming-limits','Обработайте большой результат','Выберите подход и его пределы. Не предполагается неизменяемый snapshot между пакетами, если он отдельно не обеспечен.',[
 ['buffer','ToListAsync для миллионов строк','Материализация всего результата в память процесса'],
 ['stream','AsAsyncEnumerable с WithCancellation(ct)','Последовательная обработка с отменой; внутренняя буферизация всё ещё возможна'],
 ['connection','Перечисление SQL-результата ещё не завершено','Ридер/соединение может оставаться занятым; второй запрос на том же контексте не запускать параллельно'],
 ['batch','Пакеты сортируются по Id; нужен следующий пакет','Использовать Id последней выданной строки и фильтр Id > lastId'],
 ['count','Нужно только число строк','Серверный LongCountAsync вместо выгрузки всех объектов']
 ],'Streaming ограничивает материализацию на уровне приложения, но не гарантирует нулевую память или отсутствие buffering провайдером. Пакетный keyset-процесс требует устойчивого курсора, отмены и правил повторного выполнения.')]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m13',lessonId:`m13-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module13-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module13 exercises')

