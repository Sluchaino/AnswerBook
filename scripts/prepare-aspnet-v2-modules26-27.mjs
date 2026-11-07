import fs from 'node:fs'
import {withContentLock} from './lib/content-lock.mjs'
import {validateExercise} from '../src/lib/exercises.ts'
const base=(module,id,type,title,description,explanation)=>({id:`aspnet-v2-m${module}-${id}`,type,version:1,title,description,instructions:'Установите соответствия или порядок действий согласно условию. Проверка выполняется локально.',feedback:{success:'Верно: условия сценария соблюдены.',failure:'Проверьте ограничения и попробуйте ещё раз.',explanation},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
const match=(m,id,title,description,rows,why)=>({...base(m,id,'matching',title,description,why),content:{left:rows.map(([id,label])=>({id,label})),right:rows.map(([id,,label])=>({id:'r-'+id,label}))},validation:{pairs:Object.fromEntries(rows.map(([id])=>[id,'r-'+id]))}})
const sequence=(m,id,title,description,steps,why)=>({...base(m,id,'sequence',title,description,why),content:{items:steps.map((label,i)=>({id:'s'+i,label}))},validation:{acceptedOrders:[steps.map((_,i)=>'s'+i)]}})
const debug=(m,id,title,description,code,line,fixes,why)=>({...base(m,id,'code-debug',title,description,why),content:{language:'csharp',code,errors:[{id:'error',location:{kind:'line',line},explanation:why}],fixOptions:fixes.map((code,i)=>({id:'f'+i,code}))},validation:{acceptedFixes:{error:['f0']}}})
const entries=[
 [26,1,'theory-2',sequence(26,'graceful','Остановка worker после SIGTERM','Учебная модель: readiness снимается до остановки приёма фоновой работы. Есть 30 секунд на дренирование durable очереди. Выстройте шаги.',[
 'Получить SIGTERM','Переключить readiness в not ready','Перестать принимать новую фоновую работу','Завершить работу или сохранить её состояние в durable queue в пределах дедлайна','Завершить процесс после StopAsync или дедлайна'
 ],'Это заданная учебная последовательность. В реальном оркестраторе этапы могут перекрываться; SIGKILL не гарантирует выполнение StopAsync.')],
 [26,3,'theory-2',debug(26,'request-token','Потерян токен запроса','При тайм-ауте входящего запроса ожидание должно отмениться. Найдите одну ошибочную строку.',`builder.Services.AddRequestTimeouts();
var app = builder.Build();
app.UseRequestTimeouts();
app.MapGet("/wait", async (HttpContext http) =>
{
    await Task.Delay(TimeSpan.FromSeconds(10), CancellationToken.None);
    return Results.Ok();
}).WithRequestTimeout(TimeSpan.FromSeconds(2));`,6,[
 '    await Task.Delay(TimeSpan.FromSeconds(10), http.RequestAborted);','    await Task.Delay(TimeSpan.FromSeconds(10), CancellationToken.None);','    Thread.Sleep(10000);','    await Task.Delay(TimeSpan.FromSeconds(10));'
 ],'Timeout не прерывает произвольную работу принудительно: операция должна наблюдать RequestAborted.')],
 [26,5,'theory-2',match(26,'bounded-queue','Состояния ограниченной очереди','Channel ёмкостью 2, FullMode.Wait. Все шаги последовательны; чтение выполняется только на шаге 4. Сопоставьте каждый шаг с результатом и очередью после него.',[
 ['one','1. TryWrite("A")','true; очередь [A]'],['two','2. TryWrite("B")','true; очередь [A, B]'],['three','3. TryWrite("C")','false; очередь остаётся [A, B]'],['four','4. TryRead(out item)','true; item = A; очередь [B]'],['five','5. TryWrite("C")','true; очередь [B, C]']
 ],'TryWrite не ждёт место: при заполненном канале в режиме Wait возвращается false. TryRead удаляет только один элемент. Канал не является durable хранилищем.')],
 [26,6,'application',match(26,'global-quota','Роли в схеме глобальной квоты','Три реплики; нужна общая квота 60 запросов в минуту на проверенного пользователя. Квота применяется gateway, при сбое её хранилища выбран fail closed.',[
 ['client','Клиент','Отправляет запрос gateway; не выбирает доверенную личность произвольным заголовком'],['gateway','API Gateway + auth + global limiter','Проверяет личность и общую квоту, затем выбирает реплику'],['store','Общее хранилище лимитов','Атомарно обновляет общий счётчик для всех реплик'],['replicas','Локальные limiters трёх реплик','Защищают отдельные реплики от всплесков, не задают общую квоту'],['failure','Общее хранилище квоты недоступно','Gateway отклоняет запрос согласно принятой fail-closed политике']
 ],'Независимые локальные счётчики не обеспечивают строгий глобальный лимит. Нужны общая точка проверки и атомарное состояние.')],
 [26,9,'application',match(26,'restore','Восстановление, RPO и RTO','Выберите подходящий механизм для каждого сценария. Каждый механизм используется один раз.',[
 ['dump','Восстановить БД из вчерашнего логического снимка','pg_dump -Fc и pg_restore на отдельной БД'],['pitr','Вернуться к моменту за три минуты до ошибочного удаления','Физическая базовая копия, архив WAL и PITR'],['rto','Проверить восстановление за 60 минут','Репетиция с хронометражем и проверкой приложения'],['isolate','Защитить копии от компрометации production-учётной записи','Независимые права, шифрование и retention копий']
 ],'Dump даёт снимок, PITR — восстановление по WAL. Наличие копии не доказывает RTO без репетиции.')],
 [27,1,'application',match(27,'acceptance','Требование и приёмочная проверка','Сопоставьте требование с наблюдаемой проверкой HTTP API.',[
 ['title','Пустой Title запрещён','POST с пустым Title возвращает 400 и структурированную ошибку'],['created','Задача создаётся успешно','POST возвращает 201 и Location'],['owner','Чужая задача недоступна','Второй пользователь не может прочитать, изменить или удалить задачу первого'],['page','Размер страницы ограничен','Чрезмерный pageSize не приводит к неограниченной выборке']
 ],'Критерий приёмки проверяет поведение и границы безопасности, а не только наличие классов или запуск сервиса.')],
 [27,2,'theory-2',match(27,'dto-boundary','Каким данным доверять при создании?','Клиент создаёт задачу. Разделите разрешённый ввод, серверные поля и публичный ответ.',[
 ['title','Title из CreateTaskRequest','Проверить пользовательский ввод по правилам DTO и домена'],['owner','OwnerId создаваемой задачи','Получить стабильный ID из проверенных claims'],['id','Id и CreatedAtUtc','Назначить сервером, не принимать как доверенные из JSON'],['state','Начальное состояние задачи','Установить по правилам сценария создания'],['response','Ответ успешного POST','Вернуть TaskResponse и 201 с адресом ресурса']
 ],'DTO ограничивает ввод, сервер назначает принадлежащие ему поля. HTTPS не делает присланный OwnerId доверенным.')],
 [27,5,'theory-1',sequence(27,'post-flow','Путь успешного POST','Соберите логический путь: привязка DTO, проверка, создание, сохранение, ответ. Все проверки доступа к сценарию выполнены до создания.',[
 'Принять POST и привязать CreateTaskRequest','Проверить форму запроса и применимые бизнес-правила','Создать TaskItem с серверным Id, владельцем и временем','Сохранить задачу в PostgreSQL','Преобразовать сохранённую задачу в TaskResponse','Вернуть 201 Created и Location'
 ],'Успех подтверждается после сохранения. Серверные поля не копируются из недоверенного DTO.')],
 [27,9,'theory-2',debug(27,'ownership','Проверки входа недостаточно','Пользователь аутентифицирован. userId — его стабильный ID из проверенных claims. Исправьте запрос, чтобы чужая задача не выдавалась клиенту; политика маскирует её как 404.',`public async Task<IActionResult> Get(Guid id, CancellationToken ct)
{
    var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
    var task = await _db.Tasks
        .FirstOrDefaultAsync(x => x.Id == id, ct);
    return task is null ? NotFound() : Ok(task);
}`,5,[
 '        .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == userId, ct);','        .FirstOrDefaultAsync(x => x.Id == id, ct);','        .FirstOrDefaultAsync(x => x.Id == id || x.OwnerId == userId, ct);','        .FirstOrDefaultAsync(x => x.OwnerId == userId, ct);'
 ],'Проверка владельца входит в запрос вместе с Id. Одного факта входа недостаточно; OR раскрывает чужую запись, а удаление фильтра Id меняет смысл маршрута.')],
 [27,10,'theory-2',sequence(27,'query-pipeline','Соберите серверный запрос страницы','Используйте порядок из учебной модели. page и pageSize проверены, currentUserId доверенный. Все операции до материализации остаются частью IQueryable.',[
 'Where(x => x.OwnerId == currentUserId)','Where(x => x.IsCompleted)','OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)','Skip((page - 1) * pageSize).Take(pageSize)','Select(x => new TaskResponse(...))','ToListAsync(cancellationToken)'
 ],'Условия, стабильная сортировка, страница и проекция выполняются до материализации. Два Where семантически могут переставляться; в этой модели зафиксирован порядок сначала по владельцу.')]
]
const placements=entries.map(([number,lesson,anchor,exercise])=>({moduleId:`m${number}`,lessonId:`m${number}-l${String(lesson).padStart(2,'0')}`,afterBlockId:anchor,block:{id:exercise.id,kind:'exercise',exercise:validateExercise(exercise)}}))
withContentLock(()=>{const p='server/exercise-source/aspnet-core-foundations-v2.json',all=JSON.parse(fs.readFileSync(p));for(const entry of placements){const prior=all.find(p=>p.block.exercise.id===entry.block.exercise.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(entry))throw Error('Существующий интерактив отличается');if(!prior)all.push(entry)}fs.writeFileSync(p,JSON.stringify(all,null,2)+'\n')})
console.log('Prepared ten exercises across ten lessons')
