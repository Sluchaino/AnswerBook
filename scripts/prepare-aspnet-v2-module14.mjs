import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m14-'+id,type,version:1,title,description,instructions:'EF Core 10 / PostgreSQL. Отличайте координацию сценария, атомарность, изоляцию и внешние эффекты.',feedback:{success:'Верно: решение соответствует условию.',failure:'Проверьте границы гарантий и попробуйте ещё раз.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const cursorCode=`public static class ProductPages
{
    public static IQueryable<Product> Build(IQueryable<Product> products, ProductCursor cursor, int pageSize)
    {
        return products
            .Where(p => p.CreatedAt >= cursor.CreatedAt)
            .OrderBy(p => p.CreatedAt)
            .ThenBy(p => p.Id)
            .Take(pageSize + 1);
    }
}
public sealed record ProductCursor(DateTimeOffset CreatedAt, int Id);
public sealed class Product
{
    public int Id {get;set;}
    public DateTimeOffset CreatedAt {get;set;}
}`
const entries=[
 [1,match('unit-of-work','Где проходит граница сохранения?', 'Рассматривается EF Core с реляционным провайдером, поддерживающим транзакции. Общая явная транзакция отсутствует, если не указано иначе.',[
 ['context','Один scoped DbContext живёт весь HTTP-запрос','Это не означает одну SQL-транзакцию на весь запрос'],
 ['single','Заказ и строки добавлены, затем один SaveChangesAsync','Связанные операции сохранения выполняются атомарно в рамках этого вызова'],
 ['multiple','Первый SaveChanges прошёл, второй завершился ошибкой','Без общей транзакции возможен частичный результат'],
 ['response','Endpoint должен вернуть Created с серверным ключом','Формировать успешный ответ после успешного сохранения'],
 ['external','После commit отправлено письмо через внешний HTTP API','Эта отправка не откатится вместе с SQL-транзакцией']
 ],'DbContext управляет единицей работы, но его lifetime не является границей транзакции. Один SaveChanges и несколько отдельных сохранений имеют разные гарантии; внешний сервис требует отдельного протокола.')],
 [3,match('application-boundaries','Распределите ответственность сценария','Нужно резервировать товар из HTTP endpoint и из фонового процесса. Не смешивайте DTO, права, предметный отказ и гарантии хранилища.',[
 ['transport','Сопоставить InsufficientStock с HTTP 409','Транспортная граница endpoint'],
 ['application','Скоординировать резервирование, запись и границу сохранения','Прикладной сервис / coordinator'],
 ['domain','Запретить отрицательный объём резервирования','Предметный инвариант'],
 ['infrastructure','Перевести LINQ и выполнить условный UPDATE PostgreSQL','Инфраструктурный слой доступа к данным'],
 ['race','Два scoped сервиса прочитали Stock=1 и каждый сделал Stock-=1','Нужна гарантия конкурентной операции в хранилище; выделение сервиса гонку не устраняет']
 ],'Разделение на слои полезно только при ясных обязанностях. Типизированный результат может использоваться без HttpContext, а корректная архитектура сама по себе не делает чтение+запись атомарными.')],
 [4,{...common('atomic-reservation','code-order','Соберите резервирование с записью операции','Вход и права уже проверены, operationId задаёт логическую операцию. В одной транзакции сначала условно спишите одну единицу, при affected=0 верните false; иначе запишите Reservation, сохраните и выполните Commit перед true. Открытая транзакция при раннем выходе освобождается с откатом.','Условие Stock>0 и уменьшение выполняются одной SQL-командой. Reservation должен попасть в ту же транзакцию. Уникальность OperationId — отдельное ограничение; обработка повторного запроса требует самостоятельного договора.'),content:{language:'csharp',prefix:'using Microsoft.EntityFrameworkCore;\npublic static class InventoryCommands\n{\n    public static async Task<bool> Reserve(CatalogDbContext db,int productId,Guid operationId,CancellationToken ct)\n    {',fragments:[
 {id:'begin',code:'        await using var tx = await db.Database.BeginTransactionAsync(ct);'},
 {id:'update',code:'        int affected = await db.Inventory.Where(x => x.ProductId == productId && x.Stock > 0)\n            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Stock, x => x.Stock - 1), ct);'},
 {id:'check',code:'        if (affected == 0) return false;'},
 {id:'reservation',code:'        db.Reservations.Add(new Reservation { ProductId=productId, OperationId=operationId });'},
 {id:'save',code:'        await db.SaveChangesAsync(ct);'},
 {id:'commit',code:'        await tx.CommitAsync(ct);'},
 {id:'success',code:'        return true;'}],suffix:'    }\n}\npublic sealed class InventoryItem{public int ProductId{get;set;}public int Stock{get;set;}}\npublic sealed class Reservation{public Guid Id{get;set;}=Guid.NewGuid();public int ProductId{get;set;}public Guid OperationId{get;set;}}\npublic sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options):DbContext(options)\n{\n    public DbSet<InventoryItem> Inventory=>Set<InventoryItem>();\n    public DbSet<Reservation> Reservations=>Set<Reservation>();\n    protected override void OnModelCreating(ModelBuilder b)\n    {\n        b.Entity<InventoryItem>().HasKey(x=>x.ProductId);\n        b.Entity<Reservation>().HasIndex(x=>x.OperationId).IsUnique();\n    }\n}'},validation:{acceptedOrders:[['begin','update','check','reservation','save','commit','success']]}}],
 [6,match('outbox-recovery','Что произойдёт при сбое Outbox?', 'Бизнес-запись и OutboxMessage сохраняются одной транзакцией. Publisher помечает published только после подтверждения брокера; consumer имеет собственное хранилище.',[
 ['before','Publisher упал до отправки committed OutboxMessage','Запись остаётся pending и может быть отправлена повторной попыткой'],
 ['after','Брокер подтвердил отправку, publisher упал до отметки published','При повторе возможен дубликат сообщения'],
 ['consumer','Consumer должен исключить повторный бизнес-эффект одного MessageId','Уникальный журнал обработки и изменение состояния в одной транзакции consumer'],
 ['early','Предлагают пометить published до отправки для исключения дублей','Возникает риск потери события при падении между отметкой и отправкой'],
 ['external','Consumer записал inbox и вызвал внешний платёжный API','SQL-транзакция не делает внешний вызов автоматически идемпотентным']
 ],'Outbox устраняет разрыв между бизнес-коммитом и регистрацией события, но допускает повторную доставку. Inbox, идемпотентность внешних API и наблюдаемость решают отдельные задачи.')],
 [7,{...common('keyset-boundary','code-debug','Не повторите строку курсора','Список упорядочен CreatedAt ASC, Id ASC. Курсор — последняя выданная пара. Исправьте Where: нужны только строки строго после неё, включая больший Id с тем же CreatedAt и любой Id с большей датой. pageSize положительный; дополнительная строка используется для hasNext.','Для лексикографического порядка нужны CreatedAt>lastDate ИЛИ равная дата и Id>lastId. Условие >= повторяет курсор, только > по дате теряет строки с одинаковой датой. Keyset не гарантирует неизменяемый snapshot.'),content:{language:'csharp',code:cursorCode,errors:[{id:'boundary',location:{kind:'line',line:6},explanation:'Дата >= включает уже выданную строку курсора и предыдущие Id той же даты.'}],fixOptions:[
 {id:'lexicographic',code:'            .Where(p => p.CreatedAt > cursor.CreatedAt || (p.CreatedAt == cursor.CreatedAt && p.Id > cursor.Id))'},
 {id:'inclusive',code:'            .Where(p => p.CreatedAt >= cursor.CreatedAt)'},
 {id:'date-only',code:'            .Where(p => p.CreatedAt > cursor.CreatedAt)'},
 {id:'both',code:'            .Where(p => p.CreatedAt > cursor.CreatedAt && p.Id > cursor.Id)'}]},validation:{acceptedFixes:{boundary:['lexicographic']}}}]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m14',lessonId:`m14-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module14-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module14 exercises')
