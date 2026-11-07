import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const common=(id,type,title,description,explanation)=>({id:'aspnet-v2-m11-'+id,type,version:1,title,description,instructions:'EF Core 10 / Npgsql. Различайте модель, отслеживание и фактически применённую схему БД.',feedback:{success:'Верно: решение соответствует условию.',failure:'Проверьте границу ответственности EF и базы данных.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(id,title,description,rows,explanation)=>({...common(id,'matching',title,description,explanation),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const indexCode=`using Microsoft.EntityFrameworkCore;
public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>()
            .HasIndex(p => p.Sku)
            .IsUnique(false);
    }
}
public sealed class Product
{
    public int Id { get; set; }
    public required string Sku { get; set; }
}`
const entries=[
 [2,match('context-lifetime','Кто отвечает за единицу работы?','Рассматривается типичный AddDbContext в ASP.NET Core. Укажите правильное поведение; операции БД действительно асинхронны.',[
 ['add','db.Products.Add(product) выполнен без SaveChangesAsync','Сущность помечена Added; INSERT ещё не отправлен'],
 ['save','Нужно отправить отслеживаемые изменения в БД','Дождаться SaveChangesAsync и обработать возможный отказ'],
 ['parallel','На одном DbContext предлагают запустить CountAsync и AnyAsync через Task.WhenAll','Нельзя выполнять параллельные операции на одном экземпляре'],
 ['scope','DbContext зарегистрирован через обычный AddDbContext','Scoped lifetime; не хранить экземпляр в singleton'],
 ['factory','Фоновая операция использует IDbContextFactory','Создать отдельный контекст на операцию и освободить его после работы']
 ],'DbContext не потокобезопасен и представляет короткую единицу работы. DbSet не является загруженным списком, Add меняет отслеживаемое состояние, SaveChanges выполняет запись.')],
 [6,{...common('category-relationship','code-order','Соберите связь категории с товарами','Настройте обязательную связь Product.CategoryId → Category.Id. У категории много товаров; автоматическое каскадное удаление товаров запрещено через Restrict. Собирается фрагмент EF-модели, без запросов к БД.','HasOne/WithMany задают стороны отношения, HasForeignKey указывает FK зависимого Product. Restrict становится частью модели и будущей схемы после миграции; наличие навигации не загружает данные.'),content:{language:'csharp',prefix:'using Microsoft.EntityFrameworkCore;\npublic sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)\n{\n    protected override void OnModelCreating(ModelBuilder modelBuilder)\n    {',fragments:[
 {id:'entity',code:'        modelBuilder.Entity<Product>()'},
 {id:'one',code:'            .HasOne(p => p.Category)'},
 {id:'many',code:'            .WithMany(c => c.Products)'},
 {id:'fk',code:'            .HasForeignKey(p => p.CategoryId)'},
 {id:'delete',code:'            .OnDelete(DeleteBehavior.Restrict);'}],suffix:'    }\n}\npublic sealed class Product\n{\n    public int Id { get; set; }\n    public int CategoryId { get; set; }\n    public Category Category { get; set; } = null!;\n}\npublic sealed class Category\n{\n    public int Id { get; set; }\n    public ICollection<Product> Products { get; } = new List<Product>();\n}'},validation:{acceptedOrders:[['entity','one','many','fk','delete']]}}],
 [7,match('join-model','Выберите модель связи с тегами','Один товар может иметь несколько тегов, тег относится ко многим товарам. Сопоставьте требование с механизмом EF.',[
 ['skip','Для пары Product–Tag нет собственных дополнительных полей','Skip navigations с таблицей связей без отдельного прикладного C#-класса'],
 ['payload','У связи требуется CreatedAtUtc и независимая конфигурация','Явная join-сущность ProductTag'],
 ['key','Нужно запретить повтор одной пары ProductId/TagId','Составной ключ пары или эквивалентное уникальное ограничение'],
 ['add','В отслеживаемую Product.Tags добавили существующий Tag','Нужно SaveChangesAsync для сохранения новой связи'],
 ['loading','У сущности объявлена коллекция Tags','Само объявление не гарантирует загрузку связанных строк']
 ],'Many-to-many хранится через join table. Дополнительные данные связи обычно требуют явной сущности. Навигации и состояние в памяти не заменяют ограничения и сохранение в БД.')],
 [8,{...common('unique-sku','code-debug','Сделайте индекс SKU уникальным','Исправьте одну строку конфигурации: EF-модель должна требовать уникальность Sku. Одного имени UX_products_sku или сортировки индекса недостаточно. Изменение модели затем потребует проверенной миграции.','IsUnique() задаёт уникальность индекса. HasDatabaseName меняет только имя, IsDescending — порядок. Модель сама по себе не изменяет уже существующую PostgreSQL-схему.'),content:{language:'csharp',code:indexCode,errors:[{id:'uniqueness',location:{kind:'line',line:9},explanation:'IsUnique(false) отключает требуемую уникальность.'}],fixOptions:[{id:'unique',code:'            .IsUnique();'},{id:'ordinary',code:'            .IsUnique(false);'},{id:'name',code:'            .HasDatabaseName("UX_products_sku");'},{id:'descending',code:'            .IsDescending();'}]},validation:{acceptedFixes:{uniqueness:['unique']}}}],
 [10,match('migration-deployment','Подготовьте безопасное изменение схемы','Выберите назначение каждого шага. Наличие миграции в репозитории не означает, что production-база уже изменена.',[
 ['snapshot','dotnet ef migrations add вычисляет различия','Новая EF-модель сравнивается с Model Snapshot, не с живой таблицей'],
 ['script','Нужно изучить SQL до применения','Сгенерировать migrations script и проверить изменения'],
 ['bundle','Нужен отдельный артефакт выполнения миграций','Migration bundle в контролируемом шаге развёртывания'],
 ['rights','HTTP-приложение и процесс деплоя используют БД','Разделить обычные права на данные и права изменения схемы'],
 ['drop','Планируется удалить столбец с нужными данными','Сначала план переноса/сохранения данных; Down не восстанавливает потерянные значения']
 ],'SQL-скрипт и bundle — артефакты разных процессов. Обоим нужны проверка, репетиция и план восстановления. Идемпотентный скрипт не отменяет блокировки или риск потери данных.')]
]
const placements=entries.map(([n,exercise])=>({moduleId:'m11',lessonId:`m11-l${String(n).padStart(2,'0')}`,afterBlockId:'application',block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
fs.writeFileSync('artifacts/aspnet-v2-module11-candidates.json',JSON.stringify(placements,null,2)+'\n');console.log('Prepared five module11 exercises')

