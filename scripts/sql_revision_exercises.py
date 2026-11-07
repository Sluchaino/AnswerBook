"""Reviewed, deterministic SQL exercises; no SQL interpreter or free-form grading."""
import json

EXERCISES = {}

def put(m, n, lesson, title, kind, instructions, content, validation, explanation):
    eid = f'sql-foundations-m{m:02}-ex{n:02}'
    EXERCISES[eid] = {'lessonId': f'sql-foundations-m{m:02}-l{lesson:02}', 'exercise': {
        'id': eid, 'version': 2, 'type': kind, 'title': title,
        'description': instructions, 'instructions': instructions,
        'content': content, 'validation': validation,
        'feedback': {'success': 'Верно. ' + explanation, 'failure': 'Проверьте условия и зависимости элементов. ' + explanation, 'explanation': explanation},
        'settings': {'practice': True, 'shuffle': True}}}

def match(m,n,l,title,pairs,explanation):
    put(m,n,l,title,'matching','Сопоставьте каждую левую карточку с одной правой. Все карточки используются один раз.',
        {'left':[{'id':f'left-{i+1}','label':a} for i,(a,b) in enumerate(pairs)],
         'right':[{'id':f'right-{i+1}','label':b} for i,(a,b) in enumerate(pairs)]},
        {'pairs':{f'left-{i+1}':f'right-{i+1}' for i in range(len(pairs))}},explanation)

def seq(m,n,l,title,steps,explanation):
    put(m,n,l,title,'sequence','Расположите шаги в порядке зависимостей указанного сценария. Каждый шаг используется один раз; речь об этом сценарии, а не универсальном порядке работы СУБД.',
        {'items':[{'id':f'step-{i+1}','label':s} for i,s in enumerate(steps)]},
        {'acceptedOrders':[[f'step-{i+1}' for i in range(len(steps))]]},explanation)

def order(m,n,l,title,fragments,explanation):
    put(m,n,l,title,'code-order','Соберите SQL из всех готовых блоков. Разделитель блоков — перевод строки. Текст блоков изменять нельзя; принимается указанная форма запроса, а не произвольный эквивалентный SQL.',
        {'language':'sql','fragments':[{'id':f'block-{i+1}','code':s} for i,s in enumerate(fragments)]},
        {'acceptedOrders':[[f'block-{i+1}' for i in range(len(fragments))]]},explanation)

def debug(m,n,l,title,code,line,fixes,explanation):
    # First replacement is correct in the author source; the renderer shuffles choices.
    assert '\n' not in fixes[0], 'A fix replaces exactly one existing line'
    put(m,n,l,title,'code-debug','Выберите ровно одну ошибочную строку и замените её целиком одной из готовых строк. Остальные строки сохраняются. '+explanation,
        {'language':'sql','code':code,'errors':[{'id':'error-1','location':{'kind':'line','line':line},'explanation':explanation}],
         'fixOptions':[{'id':f'fix-{i+1}','code':s} for i,s in enumerate(fixes)]},
        {'acceptedFixes':{'error-1':['fix-1']}},explanation)

def trace(m,n,l,title,code,stages,explanation):
    # Each stage: (line number, question, correct state, plausible wrong states).
    initial={'id':'initial','phase':'initial','lines':[],'title':'До начала сценария','variables':[], 'objects':[],
             'explanation':'Исходные данные и порядок действий зафиксированы в условии и коде.'}
    snapshots=[]; predictions=[]
    for i,(line,prompt,answer,wrong) in enumerate(stages):
        snapshots.append({'id':f'after-{i+1}','phase':'after','lines':[line],'title':f'Контрольная точка {i+1}',
                          'variables':[{'id':'state','name':'Состояние SQL-сценария','value':{'kind':'scalar','value':answer}}],
                          'objects':[],'explanation':answer+'. '+explanation})
        predictions.append({'id':f'prediction-{i+1}','atStepId': 'initial' if i==0 else f'after-{i}',
                            'kind':'variable','variableId':'state','prompt':prompt,'correctOptionId':'option-1',
                            'options':[{'id':f'option-{j+1}','value':{'kind':'scalar','value':s}} for j,s in enumerate([answer,*wrong])],
                            'explanation':answer+'. '+explanation})
    put(m,n,l,title,'code-trace','Прогнозируйте состояние в каждой контрольной точке по исходным данным и указанному порядку действий. Это фиксированная учебная трасса PostgreSQL 18: SQL на устройстве не выполняется.',
        {'language':'sql','code':code,'initial':initial,'steps':snapshots,'predictions':predictions,'defaultMode':'practice'},
        {'completion':'practice'},explanation)

def graph(m,n,l,title,nodes,edges,relation,explanation):
    put(m,n,l,title,'architecture-builder','Разместите все перечисленные узлы и соедините их. Смысл стрелки: '+relation+'. Дополнительных узлов и связей быть не должно; координаты не оцениваются. '+explanation,
        {'components':[{'id':k,'label':v,'category':'SQL','maxInstances':1,'allowedRelations':['rel']} for k,v in nodes],
         'relations':[{'id':'rel','label':relation,'directed':True}],'allowSelfEdges':False},
        {'feedbackMode':'learning','variants':[{'id':'reference','nodes':[{'id':k,'componentId':k} for k,v in nodes],
         'edges':[{'id':f'edge-{i+1}','source':a,'target':b,'relationId':'rel','directed':True} for i,(a,b) in enumerate(edges)],
         'extraComponents':[],'extraEdges':[]}],'forbiddenComponents':[],'forbiddenEdges':[]},explanation)

def data(m,n,l,title,source,threshold,fields,explanation):
    solution=[{'operationId':'filter','type':'filter','field':'price','operator':'>','value':threshold},
              {'operationId':'sort','type':'order-by','field':'price','direction':'desc'},
              {'operationId':'project','type':'select','fields':fields,'mode':'object'}]
    target=[{k:r[k] for k in fields} for r in sorted(source,key=lambda r:-r['price']) if r['price']>threshold]
    put(m,n,l,title,'data-transform',f'Отберите записи с price > {threshold}, отсортируйте по price DESC и оставьте поля '+', '.join(fields)+'. Это подготовка результата, без выполнения INSERT или другого SQL.',
        {'source':source,'schema':{'kind':'object','fields':{k:'number' if isinstance(v,(float,int)) else 'string' for k,v in source[0].items()}},
         'operations':[{'id':'filter','title':'Отбор WHERE','type':'filter','fields':['price'],'operators':['>','<','=='],'values':[threshold]},
                       {'id':'sort','title':'Сортировка ORDER BY','type':'order-by','fields':['price'],'directions':['asc','desc']},
                       {'id':'project','title':'Проекция SELECT','type':'select','fields':list(source[0]),'modes':['object']}],
         'target':{'kind':'list','items':target},'presentation':'sql'},
        {'order':'ordered','groupOrder':'unordered','requiredOperations':['filter','order-by','select'],'forbiddenOperations':[],
         'maxSteps':3,'solution':solution},explanation)

def build():
    match(1,1,1,'Термины реляционной базы данных',[
        ('База данных','Организованные данные'),('СУБД','Программа управления данными'),('Схема','Пространство имён объектов'),
        ('Таблица','Набор строк с определёнными столбцами'),('Строка','Одна запись'),('Столбец','Именованное свойство записи')],
        'СУБД управляет базами данных; строка и столбец описывают разные части таблицы. В PostgreSQL схема — пространство имён внутри базы.')
    seq(1,2,4,'Первый проход проектирования',[
        'Прочитать требования магазина','Выделить сущности из требований','Описать свойства выделенных сущностей','Установить связи сущностей по требованиям','Зафиксировать идентификаторы и внешние ключи'],
        'В этом первом проходе каждый шаг использует результат предыдущего. На практике проектирование итеративно.')
    graph(1,3,2,'Связи таблиц магазина', [('customers','customers(customer_id PK)'),('orders','orders(order_id PK, customer_id FK)'),('items','order_items(order_id FK, product_id FK)'),('products','products(product_id PK, category_id FK)'),('categories','categories(category_id PK)')],
          [('orders','customers'),('items','orders'),('items','products'),('products','categories')],'FK → таблица с целевым ключом','Заказ и товар связаны через позиции; стрелка направлена от внешнего ключа к целевому ключу.')
    match(1,4,5,'Кратность и обязательность', [('Один профиль на покупателя','1:1 при UNIQUE FK'),('Несколько заказов покупателя','1:N'),('Много товаров во многих заказах','N:M через order_items'),('Заказ может не иметь платежа','Необязательная связь на данном этапе')],
          'Внешний ключ сам по себе не создаёт UNIQUE. Допустимое отсутствие связанной строки зависит от бизнес-правил и направления связи.')
    order(1,5,3,'Простой SELECT',['SELECT customer_id, email','FROM customers','ORDER BY customer_id;'],'SELECT задаёт результат, FROM — источник, ORDER BY — гарантированный порядок.')

    order(2,1,1,'Источник и столбцы',['SELECT product_id, product_name','FROM products;'],'SELECT выбирает перечисленные столбцы, а не изменяет таблицу.')
    match(2,2,2,'Проекция и выражения',[('SELECT price','Один исходный столбец'),('SELECT price * 2 AS doubled','Вычисление и имя результата'),('SELECT product_name, price','Два столбца в указанном порядке'),('SELECT *','Все доступные столбцы источника')],'Проекция определяет столбцы результата; AS меняет имя результата, а не имя поля таблицы.')
    debug(2,3,3,'Цена строго больше 1000','SELECT product_id, price\nFROM products\nWHERE price >= 1000;',3,['WHERE price > 1000;','WHERE price < 1000;','WHERE price = 1000;'],'По требованию цена 1000 исключается: нужен строгий оператор >.')
    seq(2,4,4,'Значение логического выражения',['Для x=5 вычислить x > 3: TRUE','Подставить TRUE в FALSE OR (TRUE AND FALSE)','Вычислить TRUE AND FALSE: FALSE','Вычислить FALSE OR FALSE: FALSE'], 'AND имеет больший приоритет, чем OR; это порядок разбора выражения, а не гарантия физического вычисления предикатов.')
    match(2,5,5,'Выбор предиката',[('Цена от 10 до 20 включительно','price BETWEEN 10 AND 20'),('Два заданных статуса',"status IN ('new','paid')"),('Имя начинается с A',"name LIKE 'A%'"),('Имя содержит abc',"name LIKE '%abc%'")],'BETWEEN включает обе границы; % в LIKE обозначает произвольную последовательность символов.')
    debug(2,6,6,'Неизвестная дата оплаты','SELECT order_id\nFROM orders\nWHERE paid_at = NULL;',3,['WHERE paid_at IS NULL;','WHERE paid_at IS NOT NULL;','WHERE paid_at = 0;'],'Сравнение = NULL даёт UNKNOWN; для отсутствующего значения нужна проверка IS NULL.')
    order(2,7,7,'Детерминированная сортировка',['SELECT order_id, created_at','FROM orders','ORDER BY created_at DESC, order_id ASC;'],'При одинаковом created_at уникальный order_id разрешает ничью.')
    data(2,8,8,'Конвейер выборки',[{'product_name':'A','price':2000},{'product_name':'B','price':5000},{'product_name':'C','price':4000}],3000,['product_name','price'],
         'price присутствует в проекции: проекция до фильтрации не теряет поле. Допускаются эквивалентные конвейеры, которые дают тот же упорядоченный результат и используют три требуемые операции. Это не физический план SQL.')

    match(3,1,1,'Типы значений',[('Цена с двумя десятичными знаками','numeric(12,2)'),('Момент события с часовым поясом','timestamptz'),('Логический флаг','boolean'),('Произвольный текст','text')],'Тип выбирают по смыслу значения и требуемой точности, а не только по размеру.')
    seq(3,2,2,'Арифметический приоритет',['Взять выражение (2 + 3) * 4 - 1','Вычислить скобки: 5 * 4 - 1','Вычислить умножение: 20 - 1','Получить результат: 19'],'Скобки предшествуют умножению; вычитание выполняется последним.')
    match(3,3,3,'Строковые функции',[('Убрать пробелы по краям','trim'),('Привести к нижнему регистру','lower'),('Количество символов','char_length'),('Заменить подстроку','replace')],'char_length считает символы, а octet_length — байты.')
    match(3,4,4,'Дата и время',[('Календарная дата без времени','date'),('Время суток без даты','time'),('Локальные дата и время без пояса','timestamp'),('Момент времени','timestamptz')],'timestamptz хранит момент, а отображение зависит от TimeZone сессии.')
    debug(3,5,5,'Десятичное деление','SELECT\n  CAST(5 / 2 AS numeric) AS ratio;',2,['  CAST(5 AS numeric) / 2 AS ratio;','  CAST(5 / 2 AS integer) AS ratio;','  5 / 2 AS ratio;'],'Нужно получить 2.5. Приведение результата целочисленного деления уже не возвращает потерянную дробь.')
    order(3,6,6,'CASE для статуса',['SELECT order_id,','CASE WHEN status = \'paid\' THEN \'Оплачен\'','ELSE \'Не оплачен\' END AS label','FROM orders;'],'CASE возвращает значение; END завершает выражение до FROM.')

    match(4,1,1,'Агрегатные функции',[('Все строки','COUNT(*)'),('Ненулевые amount','COUNT(amount)'),('Сумма ненулевых amount','SUM(amount)'),('Среднее ненулевых amount','AVG(amount)'),('Различные ненулевые статусы','COUNT(DISTINCT status)')],'COUNT(column) пропускает NULL; COUNT(*) считает строки.')
    order(4,2,2,'GROUP BY',['SELECT status, COUNT(*) AS orders_count','FROM orders','GROUP BY status','ORDER BY status;'],'Все неагрегированные поля результата здесь входят в GROUP BY.')
    debug(4,3,3,'Фильтр по числу заказов','SELECT status, COUNT(*)\nFROM orders\nWHERE COUNT(*) >= 2\nGROUP BY status;',3,['HAVING COUNT(*) >= 2','WHERE status = \'paid\'','WHERE COUNT(*) = 0'],'Заменить строку недостаточно: HAVING должен стоять после GROUP BY.')
    # Keep one-line repair and correct SQL clause position.
    EXERCISES['sql-foundations-m04-ex03']['exercise']['content']['code']='SELECT status, COUNT(*)\nFROM orders\nGROUP BY status\nWHERE COUNT(*) >= 2;'
    e=EXERCISES['sql-foundations-m04-ex03']['exercise']; e['content']['errors'][0]['location']['line']=4
    e['content']['fixOptions']=[{'id':'fix-1','code':'HAVING COUNT(*) >= 2;'}, {'id':'fix-2','code':'HAVING COUNT(*) < 2;'}, {'id':'fix-3','code':'ORDER BY status;'}]
    e['instructions']='Получите только статусы, для которых есть не менее двух заказов. Исправьте ровно одну строку.'
    e['content']['errors'][0]['explanation']='WHERE не может стоять после GROUP BY и не фильтрует агрегатные группы; нужен HAVING.'
    e['feedback']={'success':'Верно: HAVING фильтрует группы после GROUP BY.','failure':'Проверьте, какая часть SQL фильтрует COUNT(*) >= 2.','explanation':'HAVING COUNT(*) >= 2 сохраняет только группы минимум с двумя строками.'}
    trace(4,4,4,'Агрегаты и NULL','WITH t(x) AS (VALUES (10), (NULL::int), (20))\nSELECT COUNT(*), COUNT(x), SUM(x), AVG(x) FROM t;',[(2,'Какие четыре значения вернёт запрос?','3; 2; 30; 15',['3; 3; 30; 10','2; 2; NULL; NULL'])],'NULL не участвует в SUM/AVG/COUNT(x), но строка с NULL входит в COUNT(*).')
    order(4,6,5,'Условная агрегация',['SELECT customer_id,','COUNT(*) FILTER (WHERE status = \'paid\') AS paid_count','FROM orders','GROUP BY customer_id;'],'FILTER ограничивает строки конкретного агрегата; не нужно отбрасывать остальные строки всей группировки.')

    match(5,1,1,'Ключи соединения',[('Покупатель → заказы','customers.customer_id = orders.customer_id'),('Заказ → позиции','orders.order_id = order_items.order_id'),('Позиция → товар','order_items.product_id = products.product_id'),('Товар → категория','products.category_id = categories.category_id')],'Соединяют соответствующие ключи, а не случайно похожие значения.')
    trace(5,2,2,'INNER JOIN и кратность','WITH orders(id) AS (VALUES (1),(2),(3)),\nitems(id, order_id) AS (VALUES (10,1),(11,1),(12,2))\nSELECT o.id, i.id FROM orders o JOIN items i ON i.order_id=o.id\nORDER BY o.id,i.id;',[(4,'Каков результат JOIN?','(1,10); (1,11); (2,12)',['(1,10); (2,12); (3,NULL)','(1,10); (2,12)'])],'Каждая подходящая пара даёт строку; заказ без позиций исключается.')
    debug(5,3,3,'Заказы без позиций','SELECT o.order_id\nFROM orders o\nINNER JOIN order_items i ON i.order_id=o.order_id\nWHERE i.order_item_id IS NULL;',3,['LEFT JOIN order_items i ON i.order_id=o.order_id','CROSS JOIN order_items i','RIGHT JOIN order_items i ON i.order_id=o.order_id'],'Нужно сохранить все заказы слева и затем выбрать отсутствие ненулевого PK позиции.')
    match(5,4,4,'Типы соединений',[('Только совпавшие пары','INNER JOIN'),('Все строки левого источника','LEFT JOIN'),('Все строки правого источника','RIGHT JOIN'),('Оба источника, включая несовпавшие','FULL OUTER JOIN')],'Внешнее соединение дополняет недостающую сторону NULL.')
    trace(5,5,5,'Декартово произведение','WITH a(x) AS (VALUES (1),(2)), b(y) AS (VALUES (10),(20),(30))\nSELECT x,y FROM a CROSS JOIN b ORDER BY x,y;',[(2,'Сколько строк и какие пары получатся?','6: (1,10),(1,20),(1,30),(2,10),(2,20),(2,30)',['3: (1,10),(2,20),(NULL,30)','2: (1,10),(2,20)'])],'CROSS JOIN создаёт каждую пару: 2 × 3 = 6, условие равенства не применяется.')
    order(5,6,6,'Цепочка JOIN',['SELECT o.order_id, p.product_name','FROM orders o','JOIN order_items i ON i.order_id=o.order_id','JOIN products p ON p.product_id=i.product_id;'],'Позиции раскрывают связь заказа и товара; ссылка на i должна идти после объявления i.')
    debug(5,7,7,'Сохранить заказы без оплаченного платежа','SELECT o.order_id, p.payment_id\nFROM orders o\nLEFT JOIN payments p ON p.order_id=o.order_id\nWHERE p.status=\'succeeded\';',4,["AND p.status='succeeded';","WHERE p.status='failed';","WHERE p.payment_id IS NOT NULL;"],'Фильтр успешности должен стать частью ON, чтобы заказ без подходящего платежа оставался с NULL справа.')

    match(6,1,1,'Контексты подзапроса',[('Одно значение в выражении','Скалярный подзапрос'),('Источник строк в FROM','Производная таблица'),('Проверка наличия строки','EXISTS'),('Ссылка на строку внешнего запроса','Коррелированный подзапрос')],'Скалярный подзапрос допускает максимум одну строку и один столбец.')
    trace(6,2,2,'Скалярная средняя цена','WITH products(price) AS (VALUES (10),(20),(30))\nSELECT price FROM products\nWHERE price > (SELECT AVG(price) FROM products) ORDER BY price;',[(3,'Чему равно среднее и какие цены останутся?','AVG=20; результат: 30',['AVG=20; результат: 20,30','AVG=30; результат пуст'])],'Сравнение строгое: цена, равная среднему, не проходит.')
    debug(6,3,3,'Одна строка вместо набора','SELECT product_id\nFROM products\nWHERE price > (SELECT price FROM products);',3,['WHERE price > (SELECT AVG(price) FROM products);','WHERE price > (SELECT price, product_id FROM products);','WHERE price > (SELECT price FROM products ORDER BY price);'],'Нужно сравнить с общей средней ценой; сортировка набора не делает его скалярным.')
    match(6,4,4,'IN, NOT IN и NULL',[('2 IN (1, NULL)','UNKNOWN: совпадения нет, есть NULL'),('1 IN (1, NULL)','TRUE: совпадение найдено'),('2 NOT IN (1, NULL)','UNKNOWN: отрицание UNKNOWN'),('2 NOT IN (1, 3)','TRUE: NULL отсутствует')],'WHERE сохраняет только TRUE. UNKNOWN нельзя считать FALSE во всех контекстах, хотя обе оценки отбрасываются WHERE.')
    match(6,5,5,'EXISTS',[('Подзапрос вернул хотя бы строку','EXISTS = TRUE'),('Подзапрос пуст','EXISTS = FALSE'),('Нужны покупатели без заказов','NOT EXISTS с корреляцией customer_id'),('Нужны покупатели с заказом','EXISTS с корреляцией customer_id')],'EXISTS проверяет наличие строк, даже если значения выбранных столбцов — NULL.')
    trace(6,6,6,'ANY и ALL','SELECT 15 > ANY(ARRAY[10,20]) AS a,\n15 > ALL(ARRAY[10,20]) AS b,\n15 > ALL(ARRAY[]::int[]) AS c;',[(3,'Какие значения a, b, c?','TRUE; FALSE; TRUE',['TRUE; TRUE; FALSE','FALSE; FALSE; FALSE'])],'ANY требует хотя бы одно TRUE; ALL — все TRUE. Для пустого набора ALL истинен.')
    match(6,7,7,'Операции над наборами',[('Сохранить дубликаты при объединении','UNION ALL'),('Объединить с удалением дубликатов','UNION'),('Общие строки двух результатов','INTERSECT'),('Строки первого, отсутствующие во втором','EXCEPT')],'Без ALL эти операции удаляют дубликаты; столбцы должны быть совместимы.')

    order(7,1,1,'INSERT с RETURNING',["INSERT INTO customers (customer_name, email)","VALUES ('Анна', 'anna@example.test')",'RETURNING customer_id;'],'Перечень столбцов согласован с VALUES; RETURNING возвращает сгенерированный ключ.')
    match(7,2,2,'Вставка значений',[('Взять значение по умолчанию','DEFAULT'),('Вернуть созданный ID','RETURNING'),('Несколько строк одной командой','Несколько кортежей VALUES'),('Не указывать генерируемый ID','Пропустить столбец ID в INSERT')],'Пропуск обязательного столбца без DEFAULT и явный NULL — разные вещи.')
    data(7,3,3,'Источник INSERT SELECT',[{'product_id':1,'price':5},{'product_id':2,'price':25},{'product_id':3,'price':15}],10,['product_id','price'],'Конструктор готовит только SELECT-набор; вставка в таблицу и её ограничения здесь не моделируются.')
    debug(7,4,4,'Изменить один заказ',"UPDATE orders\nSET status='paid'\nWHERE order_id <> 5001;",3,['WHERE order_id = 5001;','WHERE order_id > 5001;','WHERE order_id IS NOT NULL;'],'Требуется изменить только заказ 5001, а не все остальные.')
    seq(7,5,5,'Удаление без CASCADE',['Начать транзакцию','Удалить позиции выбранного заказа','Удалить сам выбранный заказ','Зафиксировать транзакцию'],'Для сценария других дочерних таблиц нет; FK запрещает сначала удалить родителя. Каскадное удаление не настроено.')
    trace(7,6,6,'UPSERT','CREATE TEMP TABLE t(id int PRIMARY KEY, qty int);\nINSERT INTO t VALUES (1,5);\nINSERT INTO t VALUES (1,2) ON CONFLICT(id) DO UPDATE SET qty=t.qty+EXCLUDED.qty;\nSELECT qty FROM t WHERE id=1;',[(4,'Какое значение qty будет возвращено?','7',['2','5'])],'EXCLUDED.qty равно 2, существующее qty равно 5: ветка UPDATE складывает их.')

    order(8,1,1,'CREATE TABLE',['CREATE TABLE products (','product_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,','price numeric(12,2) NOT NULL CHECK (price > 0)',');'],'Определения столбцов разделены запятыми, последнее — без запятой.')
    match(8,2,2,'Ключ и генерация',[('Однозначно идентифицировать строку','PRIMARY KEY'),('Автоматически получать числовые ID','IDENTITY'),('Разрешить явный ID при вставке','GENERATED BY DEFAULT'),('Связать дочернюю строку с родителем','FOREIGN KEY')],'IDENTITY генерирует значения, но уникальность обеспечивает отдельное ограничение.')
    debug(8,3,3,'Положительная обязательная цена','CREATE TABLE products (\nproduct_id int PRIMARY KEY,\nprice numeric CHECK (price >= 0)\n);',3,['price numeric NOT NULL CHECK (price > 0)','price numeric CHECK (price > 0)','price numeric NOT NULL CHECK (price >= 0)'],'Цена должна быть строго положительной и не NULL; один CHECK не отвергает UNKNOWN.')
    graph(8,4,5,'Внешние ключи',[('customers','customers(id PK)'),('orders','orders(id PK, customer_id FK)'),('items','items(order_id FK)')],[('items','orders'),('orders','customers')],'ссылается на','items.order_id ссылается на orders.id, orders.customer_id — на customers.id.')
    seq(8,5,6,'Добавить обязательный столбец',['Добавить nullable-столбец phone','Заполнить phone для существующих строк','Проверить отсутствие NULL','Установить NOT NULL'],'Для этой миграции таблица уже содержит строки, а DEFAULT не задан.')
    trace(8,6,7,'DELETE, TRUNCATE, DROP','CREATE TEMP TABLE t(id int);\nINSERT INTO t VALUES (1),(2);\nDELETE FROM t WHERE id=1;\nTRUNCATE t;\nDROP TABLE t;',[(3,'Что после DELETE?','Таблица существует; одна строка id=2',['Таблица удалена','Таблица существует; строк нет']),(4,'Что после TRUNCATE?','Таблица существует; строк нет',['Таблица удалена','Таблица существует; id=2']),(5,'Что после DROP?','Таблица отсутствует',['Таблица есть, строк нет','Удалён только id=2'])],'DELETE удаляет выбранные строки, TRUNCATE очищает строки, DROP удаляет объект.')

    match(9,1,1,'Требования и сущности',[('Контакт покупателя','customers'),('Факт оформления','orders'),('Цена и количество в заказе','order_items'),('Остаток товара','inventory')],'Цена в позиции фиксирует условия продажи, а текущая цена товара может измениться.')
    trace(9,2,2,'Замыкание атрибутов','-- Дано: A → B, B → C; иных зависимостей нет.\n-- Старт: A+ = {A}\n-- Применить A → B\n-- Применить B → C',[(3,'Каково A+ после первой зависимости?','{A,B}',['{A}','{B,C}']),(4,'Каково итоговое A+?','{A,B,C}',['{A,C}','{A,B}'])],'Зависимость применима, когда её левая часть уже входит в замыкание; исходный A не исчезает.')
    trace(9,3,3,'Атомарные позиции вместо списка','-- Исходно: order=1, product_ids="10,20"\n-- Разделить список на две строки\n-- В каждой строке оставить один product_id',[(3,'Как выглядит результат в данной модели 1NF?','(order=1,product=10); (order=1,product=20)',['(order=1,product="10,20")','(order=1,product=10,product2=20)'])],'В выбранном домене product_id — одно число. Повторяемые столбцы не устраняют проблему списка.')
    graph(9,4,4,'Устранить частичную зависимость',[('products','products(product_id PK, name)'),('orders','orders(order_id PK)'),('items','items(order_id, product_id, qty) PK(order_id,product_id)')],[('items','products'),('items','orders')],'FK → родитель','name зависит только от product_id, а qty — от всей пары order_id,product_id; name вынесено в products.')
    debug(9,5,5,'Устранить транзитивную зависимость','-- orders: order_id → customer_id → customer_name\n-- customers(customer_id PK, customer_name) уже существует\nCREATE VIEW order_contacts AS\nSELECT o.order_id, o.customer_name\nFROM orders o JOIN customers c ON c.customer_id=o.customer_id;',4,['SELECT o.order_id, c.customer_name','SELECT o.customer_name, c.customer_id','SELECT o.order_id, o.customer_id'],'По новой нормализованной модели имя хранится только в customers; результат должен содержать order_id и имя.')
    seq(9,6,6,'Проверка декомпозиции',['Записать зависимости исходного отношения','Вывести кандидатные ключи по этим зависимостям','Найти нарушение формы относительно ключей','Предложить декомпозицию по нарушению','Проверить соединение без потерь для предложенных отношений'],'Набор зависимостей задан заранее; соединение без потерь и сохранение зависимостей — разные свойства.')

    order(10,1,1,'CTE',['WITH paid AS (',"SELECT order_id FROM orders WHERE status='paid'",')','SELECT order_id FROM paid;'],'CTE именует результат запроса в пределах одной SQL-команды.')
    graph(10,2,2,'Зависимости CTE',[('raw','raw: исходные позиции'),('totals','totals: суммы из raw'),('ranked','ranked: ранги из totals'),('output','выдача из ranked')],[('totals','raw'),('ranked','totals'),('output','ranked')],'использует результат','Стрелка идёт от потребителя к источнику; никакой гарантии материализации эта схема не даёт.')
    debug(10,3,3,'Остановить рекурсию','WITH RECURSIVE n(x) AS (\nVALUES (1)\nUNION ALL\nSELECT x+1 FROM n\n) SELECT x FROM n;',4,['SELECT x+1 FROM n WHERE x < 3','SELECT x+1 FROM n WHERE x <= 3','SELECT x+1 FROM n WHERE x > 3'],'Нужно получить ровно 1,2,3; ограничение проверяет исходный x до прибавления единицы.')
    trace(10,4,4,'Обход дерева','-- Узлы: (1,NULL),(2,1),(3,1),(4,2)\n-- Якорь: id=1, depth=0\n-- Рекурсивный шаг: дети предыдущего фронта\n-- Повторить шаг для нового фронта',[(3,'Какие дети и глубины на первом шаге?','(2,1); (3,1)',['(2,0); (3,0)','(4,1)']),(4,'Какие новые узлы на втором шаге?','(4,2)',['(1,2)','(2,2); (3,2)'])],'Глубина увеличивается на ребро; дерево ациклично, поэтому повторные вершины не возникают.')
    order(10,5,5,'CTE и CASE',['WITH totals AS (','SELECT order_id, SUM(quantity*unit_price) AS amount','FROM order_items GROUP BY order_id',')',"SELECT order_id, CASE WHEN amount >= 1000 THEN 'large' ELSE 'small' END AS segment",'FROM totals;'],'Сначала агрегируем до одного заказа; CASE использует amount из CTE.')

    order(11,1,1,'Оконная сумма',['SELECT customer_id, order_id, amount,','SUM(amount) OVER (PARTITION BY customer_id) AS customer_total','FROM order_totals;'],'Окно сохраняет строки заказов, добавляя итог по покупателю.')
    match(11,2,4,'LAG и LEAD',[('Предыдущая строка по ORDER BY','LAG(amount)'),('Следующая строка по ORDER BY','LEAD(amount)'),('На границе нет соседней строки, default не задан','NULL'),('Начать отсчёт соседей для каждого клиента заново','PARTITION BY customer_id')],'LAG/LEAD зависят от порядка внутри раздела; это не предыдущий день по календарю.')
    debug(11,3,2,'Внешняя фильтрация оконного результата','WITH ranked AS (\nSELECT order_id, customer_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, order_id DESC) AS rn\nFROM orders\n)\nSELECT order_id, customer_id FROM ranked WHERE ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_id) = 1;',5,['SELECT order_id, customer_id FROM ranked WHERE rn = 1;','SELECT order_id, customer_id FROM ranked WHERE rn > 1;','SELECT order_id, customer_id FROM ranked ORDER BY rn;'],'Окно уже вычислено в CTE; нужен только последний заказ каждого покупателя. Исправление заменяет одну строку, не весь запрос.')
    trace(11,4,3,'Ранги при равных значениях','WITH t(id,score) AS (VALUES (11,100),(12,100),(13,90),(14,80))\nSELECT id, ROW_NUMBER() OVER(ORDER BY score DESC,id) AS rn,\nRANK() OVER(ORDER BY score DESC) AS r, DENSE_RANK() OVER(ORDER BY score DESC) AS d\nFROM t ORDER BY score DESC,id;',[(4,'Каковы rn,r,d для id=13?','3; 3; 2',['3; 2; 2','3; 3; 3'])],'RANK оставляет пропуски после равных мест, DENSE_RANK не оставляет; tie-breaker id применён только в ROW_NUMBER.')
    trace(11,5,5,'Скользящая сумма','WITH t(seq,amount) AS (VALUES (1,10),(2,20),(3,5),(4,7))\nSELECT seq, SUM(amount) OVER (ORDER BY seq ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)\nFROM t ORDER BY seq;',[(3,'Какие суммы соответствуют seq=1,2,3,4?','10; 30; 35; 32',['10; 30; 35; 42','35; 32; 12; 7'])],'Рамка содержит текущую и не более двух предыдущих строк; для seq=4 строка 1 уже вне рамки.')
    seq(11,6,7,'Стадии аналитического отчёта',['Соединить позиции с товарами','Агрегировать выручку до одного товара','Посчитать ранг товаров по этой выручке','Во внешнем запросе отобрать rank <= 3','Отсортировать окончательную выдачу'],'Ранг относится к агрегированным товарам, а не отдельным позициям; внешний фильтр зависит от рассчитанного ранга.')
    graph(11,7,6,'Состав спецификации окна',[('window','Окно SUM(amount)'),('partition','PARTITION BY customer_id'),('sort','ORDER BY created_at, order_id'),('frame','ROWS 2 PRECEDING … CURRENT ROW')],[('window','partition'),('window','sort'),('window','frame')],'настроено с помощью','Нужны независимые составляющие одного окна: раздел, порядок и рамка. Стрелки исходят от окна, не образуют конвейер.')

    order(12,1,1,'Транзакционный блок',['BEGIN;','UPDATE inventory SET quantity=quantity-1 WHERE product_id=101 AND quantity>=1;','COMMIT;'],'Операция и её фиксация находятся в одном явном блоке. Приложение отдельно обязано проверить число изменённых строк.')
    match(12,2,2,'Свойства ACID',[('Все изменения или ни одного','Атомарность'),('Сохранение объявленных ограничений','Согласованность'),('Правила взаимодействия транзакций','Изоляция'),('Сохранение подтверждённых изменений при штатных гарантиях хранения','Долговечность')],'Согласованность требует корректных ограничений и логики; ACID не придумывает бизнес-правила автоматически.')
    debug(12,3,3,'Границы транзакции','BEGIN;\nUPDATE accounts SET balance=balance-10 WHERE id=1;\nCOMMIT;\nUPDATE accounts SET balance=balance+10 WHERE id=2;\nCOMMIT;',3,['-- COMMIT переносится в конец блока','ROLLBACK;','SAVEPOINT after_debit;'],'Для атомарного перевода обе операции должны войти в один блок; наличие SAVEPOINT не устраняет раннюю фиксацию.')
    # SAVEPOINT would also remove early commit, so replace this distractor with an incorrect early-ending command.
    EXERCISES['sql-foundations-m12-ex03']['exercise']['content']['fixOptions'][2]['code']='COMMIT AND CHAIN;'
    trace(12,4,4,'SAVEPOINT','CREATE TEMP TABLE t(x int);\nBEGIN;\nINSERT INTO t VALUES (1);\nSAVEPOINT s;\nINSERT INTO t VALUES (2);\nROLLBACK TO s;\nCOMMIT;\nSELECT x FROM t ORDER BY x;',[(6,'Какие строки после ROLLBACK TO s?','Только 1; транзакция продолжается',['Пусто; транзакция завершена','1 и 2; обе сохраняются']),(8,'Что после COMMIT?','Результат SELECT: 1',['Результат SELECT: 1,2','Результат SELECT пуст'])],'Откат к точке отменяет более позднюю вставку, но не первую и не весь блок.')
    graph(12,5,5,'Граф ожидания',[('s1','Сессия 1: держит A, ждёт B'),('s2','Сессия 2: держит B, ждёт A')],[('s1','s2'),('s2','s1')],'ожидает ресурс, удерживаемый сессией','Ресурсы A и B эксклюзивны; цикл ожидания образует deadlock, PostgreSQL прервёт одну транзакцию.')
    seq(12,6,6,'Read Committed в двух сессиях',['S1: SELECT balance получает 100','S2: UPDATE balance=150','S2: COMMIT','S1: следующий SELECT получает 150'],'S1 работает в READ COMMITTED; каждый отдельный SELECT получает новый снимок, незавершённая запись S2 не видна.')
    trace(12,7,7,'Условное списание','CREATE TEMP TABLE stock(id int PRIMARY KEY, qty int);\nINSERT INTO stock VALUES (1,2);\nUPDATE stock SET qty=qty-3 WHERE id=1 AND qty>=3 RETURNING qty;\nSELECT qty FROM stock WHERE id=1;',[(3,'Что вернёт UPDATE?','Ноль строк: остатка недостаточно',['Одна строка: -1','Одна строка: 2']),(4,'Каков сохранённый qty?','2',['-1','0'])],'Проверка достаточности и уменьшение входят в одну команду; отсутствие результата означает отказ, а не успех.')

    match(13,1,5,'Способ хранения результата',[('VIEW','Хранится определение запроса; результат читается из источника'),('MATERIALIZED VIEW','Хранится результат; актуализация через REFRESH'),('TEMP TABLE','Обычные строки с жизненным циклом сессии/транзакции'),('CTE','Именованный подзапрос одной команды')],'CTE не является долговечной таблицей; материализация CTE и MATERIALIZED VIEW — разные понятия.')
    order(13,2,1,'CREATE VIEW',['CREATE VIEW view_lab.order_totals AS','SELECT order_id, SUM(quantity*unit_price) AS amount','FROM shopdb_ddl.order_items','GROUP BY order_id;'],'Представление агрегирует позиции до одного заказа; одна позиция не равна всему заказу.')
    debug(13,3,2,'CHECK OPTION',"CREATE TEMP TABLE orders(id int PRIMARY KEY, status text);\nINSERT INTO orders VALUES (1,'new');\nCREATE TEMP VIEW new_orders AS SELECT * FROM orders WHERE status='new' WITH CHECK OPTION;\nUPDATE new_orders SET status='paid' WHERE id=1;",4,["UPDATE new_orders SET status='new' WHERE id=1;","UPDATE new_orders SET status='cancelled' WHERE id=1;","UPDATE new_orders SET status=NULL WHERE id=1;"],'В этой задаче изменение через VIEW должно оставлять строку видимой: status=new. Это упражнение о границе VIEW, не способ оплаты заказа.')
    trace(13,4,3,'Актуальность materialized view','CREATE TEMP TABLE t(amount int);\nINSERT INTO t VALUES (100);\nCREATE MATERIALIZED VIEW public.exercise_mv AS SELECT SUM(amount) AS total FROM t;\nINSERT INTO t VALUES (50);\nSELECT total FROM public.exercise_mv;\nREFRESH MATERIALIZED VIEW public.exercise_mv;\nSELECT total FROM public.exercise_mv;',[(5,'Что вернёт чтение до REFRESH?','100',['150','50']),(7,'Что вернёт чтение после REFRESH?','150',['100','50'])],'Materialized view не обновляется автоматически при INSERT в исходную таблицу.')
    # PostgreSQL cannot create permanent MV from a temporary relation. Use an isolated ordinary source.
    EXERCISES['sql-foundations-m13-ex04']['exercise']['content']['code']=EXERCISES['sql-foundations-m13-ex04']['exercise']['content']['code'].replace('CREATE TEMP TABLE t(amount int);','CREATE TABLE public.exercise_mv_source(amount int);').replace('INTO t VALUES','INTO public.exercise_mv_source VALUES').replace('FROM t;','FROM public.exercise_mv_source;')
    seq(13,5,6,'Подготовить REFRESH CONCURRENTLY',['Создать materialized view WITH NO DATA','Создать полный UNIQUE-индекс по уникальному ключу без выражений','Выполнить первый обычный REFRESH','Выполнить REFRESH CONCURRENTLY'],'Это заданный сценарий с изначально незаполненным MV. Первый CONCURRENTLY невозможен до заполнения. Операция разрешена внутри транзакции; WITH NO DATA нельзя сочетать с CONCURRENTLY.')
    EXERCISES['sql-foundations-m13-ex05']['exercise']['validation']['acceptedOrders'].append(['step-1','step-3','step-2','step-4'])
    match(13,6,4,'TEMP TABLE после COMMIT',[('ON COMMIT PRESERVE ROWS','Таблица и строки сохраняются'),('ON COMMIT DELETE ROWS','Таблица сохраняется, строки очищаются'),('ON COMMIT DROP','Таблица удаляется'),('Завершение сессии','Все её временные таблицы удаляются')],'Режим ON COMMIT проявляется после COMMIT; по умолчанию в PostgreSQL используется PRESERVE ROWS.')

    match(14,1,1,'Форма запроса и затраты',[('SELECT * без нужды','Лишние столбцы и трафик'),('Фильтр без подходящего индекса на большой таблице','Возможное чтение многих строк'),('LIMIT без ORDER BY','Неопределённый набор первых строк'),('EXPLAIN ANALYZE для UPDATE','Реальное изменение данных при измерении')],'План и стоимость зависят от данных; EXPLAIN без ANALYZE не выполняет запрос.')
    order(14,2,2,'Составной индекс',['CREATE INDEX orders_customer_created_idx','ON orders','(customer_id, created_at DESC);'],'Индекс соответствует равенству customer_id и сортировке created_at DESC внутри покупателя; он не гарантирует, что оптимизатор выберет его.')
    trace(14,3,3,'Строки и циклы плана','-- Фрагмент заранее измеренного плана:\n-- Nested Loop (actual rows=6 loops=1)\n-- -> outer (actual rows=3 loops=1)\n-- -> inner (actual rows=2 loops=3)',[(4,'Сколько строк inner выдал за все циклы?','6: 2 строки в среднем × 3 цикла',['2: loops не влияет','3: по одной на цикл'])],'actual rows показывается в среднем на цикл; в этом фиксированном плане 2 × 3 = 6.')
    debug(14,4,4,'Полуоткрытый диапазон даты','SELECT order_id\nFROM orders\nWHERE created_at::date = DATE \'2026-01-10\';',3,["WHERE created_at >= TIMESTAMP '2026-01-10' AND created_at < TIMESTAMP '2026-01-11';","WHERE created_at > TIMESTAMP '2026-01-10' AND created_at < TIMESTAMP '2026-01-11';","WHERE created_at BETWEEN TIMESTAMP '2026-01-10' AND TIMESTAMP '2026-01-11';"],'В этом примере created_at имеет тип timestamp without time zone; нужно сохранить все моменты 10 января без полуночи 11 января и без функции над столбцом.')
    seq(14,5,5,'Сравнить планы',['Зафиксировать данные и параметры эксперимента','Измерить исходный план EXPLAIN ANALYZE BUFFERS','Создать выбранный индекс и выполнить ANALYZE','Повторить тот же запрос с теми же параметрами','Сравнить строки, буферы, время и повторные измерения'],'Эксперимент локальный, без нагрузки пользователей. Одно измерение времени не доказывает ускорение из-за кеша и шума.')

    match(15,1,1,'Уязвимость и защита',[('Пользовательское значение в SQL-конкатенации','Заменить значение параметром'),('Пользовательское имя столбца сортировки','Выбрать идентификатор из allowlist'),('Лишние права роли приложения','Ограничить GRANT'),('Секреты в журнале SQL','Редактировать или исключить чувствительные данные')],'Параметр значения не заменяет имя таблицы/столбца; идентификаторы требуют отдельного контроля.')
    debug(15,2,2,'Параметр динамического SQL',"DO $$\nDECLARE input_email text := 'a@example.test'; result_id int;\nBEGIN\nEXECUTE 'SELECT customer_id FROM customers WHERE email = ' || quote_literal(input_email) INTO result_id;\nEND $$;",4,["EXECUTE 'SELECT customer_id FROM customers WHERE email = $1' INTO result_id USING input_email;","EXECUTE 'SELECT customer_id FROM customers WHERE email = $1' INTO result_id;","EXECUTE 'SELECT customer_id FROM customers WHERE email = input_email' INTO result_id;"],'Нужно перейти на параметр USING; quote_literal уже защищает это значение от инъекции, поэтому исходник не объявляется заведомо уязвимым, но не выполняет требование параметризации.')
    order(15,3,3,'Минимальные права чтения',['GRANT USAGE ON SCHEMA reporting TO report_reader;','GRANT SELECT ON reporting.order_totals TO report_reader;'],'Роль и VIEW уже созданы, PUBLIC не имеет лишних прав; нужны ровно доступ к схеме и чтение VIEW. Для задания принят порядок сначала контейнер, затем объект.')
    # These GRANT commands commute; both complete orders are valid.
    EXERCISES['sql-foundations-m15-ex03']['exercise']['validation']['acceptedOrders'].append(['block-2','block-1'])
    trace(15,4,4,'RLS и арендаторы',"-- Даны строки (id,tenant): (1,101),(2,102),(3,101)\n-- Роль: не owner, не superuser, без BYPASSRLS\n-- RLS включена; единственная политика USING (tenant_id=101)\nSELECT id FROM tenant_orders ORDER BY id;",[(4,'Какие ID видит эта роль?','1; 3',['1; 2; 3','2'])],'Рассматривается SELECT и одна разрешающая политика. Владелец без FORCE RLS и привилегированные роли могли бы иметь другое поведение.')
    seq(15,5,5,'Развёртывание доступа',['Создать выделенную роль без суперправ','Выдать ей доступ к нужной схеме','Выдать минимальные объектные права','Проверить разрешённые и запрещённые операции от этой роли','После проверки включить аудит значимых действий'],'Это регламент выбранного развёртывания; аудит не заменяет ограничения доступа.')

    match(16,1,1,'Требование и механизм',[('Уникальный email','UNIQUE'),('Позиция относится к существующему заказу','FOREIGN KEY'),('Остаток неотрицателен','CHECK quantity >= 0'),('Заказ и позиции фиксируются вместе','Транзакция')],'Ограничения БД и корректная логика приложения дополняют друг друга.')
    order(16,2,5,'Финансовая сводка заказа',['SELECT order_id, SUM(quantity * unit_price) AS total','FROM order_items','GROUP BY order_id','ORDER BY order_id;'],'Суммируется историческая unit_price позиции, а не текущая цена товара.')
    debug(16,3,3,'Не размножить выручку','WITH item_totals AS (SELECT order_id, SUM(quantity*unit_price) AS amount FROM order_items GROUP BY order_id)\nSELECT SUM(t.amount)\nFROM item_totals t\nJOIN payments p ON p.order_id=t.order_id;',4,["WHERE EXISTS (SELECT 1 FROM payments p WHERE p.order_id=t.order_id AND p.status='succeeded');","JOIN payments p ON p.order_id=t.order_id AND p.status='succeeded';","CROSS JOIN payments p;"],'Нужно считать заказы хотя бы с одним успешным платежом ровно один раз; допускается несколько успешных платежей на заказ. EXISTS не размножает строки.')
    order(16,4,6,'Месячная аналитика',['WITH monthly AS (',"SELECT date_trunc('month', created_at)::date AS month, SUM(total) AS revenue",'FROM order_totals','GROUP BY 1',')','SELECT month, revenue, LAG(revenue) OVER (ORDER BY month) AS previous_revenue','FROM monthly ORDER BY month;'],'order_totals содержит одну строку на заказ: created_at timestamp и total numeric. Сначала агрегируем по месяцу, потом LAG работает по месячным строкам; отсутствующие месяцы здесь не заполняются нулями.')
    seq(16,5,2,'Атомарный заказ',['BEGIN','Условно списать достаточный остаток; при отказе ROLLBACK и выход','Создать заказ и получить order_id','Создать позиции с этим order_id и историческими ценами','COMMIT'],'Это сценарий одного товара и одной транзакции. Любая ошибка до COMMIT ведёт к ROLLBACK; внешний платёжный сервис в блок не входит.')
    graph(16,6,4,'Границы SQL-проекта',[('app','Приложение: параметры и бизнес-сценарий'),('db','PostgreSQL: транзакции и ограничения'),('reports','Отчётная роль: только чтение VIEW'),('audit','Аудит: защищённый журнал')],[('app','db'),('reports','db'),('db','audit')],'передаёт запрос или событие','Приложение и отчётная роль обращаются к БД, БД передаёт события аудита. Отчётная роль не выполняет запись, аудит не изменяет бизнес-данные.')
    goals={
      'm02-ex03':'Верните только товары с ценой строго больше 1000.',
      'm02-ex06':'Верните заказы с отсутствующей датой оплаты.',
      'm03-ex05':'Получите числовой результат 2.5 при делении 5 на 2.',
      'm04-ex03':'Получите только статусы с не менее чем двумя заказами.',
      'm05-ex03':'Верните только заказы, у которых нет ни одной позиции.',
      'm05-ex07':'Сохраните все заказы. Справа покажите только успешные платежи; при их отсутствии справа должны быть NULL.',
      'm06-ex03':'Верните товары с ценой больше общей средней цены всех товаров.',
      'm07-ex04':'Измените статус только заказа 5001, не затронув другие заказы.',
      'm08-ex03':'Объявите цену обязательной и строго положительной.',
      'm09-ex05':'После нормализации имя хранится только в customers. VIEW должно возвращать номер заказа и имя его покупателя.',
      'm10-ex03':'Рекурсивный запрос должен вернуть ровно числа 1,2,3 и завершиться.',
      'm11-ex03':'Верните ровно последний заказ каждого покупателя по created_at DESC, order_id DESC. CTE ranked уже вычисляет rn.',
      'm12-ex03':'Переведите 10 между счетами атомарно: оба UPDATE должны входить в одну транзакцию.',
      'm13-ex03':'Команда через VIEW должна успешно завершиться и оставить заказ видимым в new_orders со статусом new.',
      'm14-ex04':"created_at — timestamp without time zone. Отберите все моменты 10 января 2026 года, не применяя функцию к столбцу и не захватывая полночь 11 января.",
      'm15-ex02':'Перепишите динамический запрос на передачу input_email как параметра значения. Исходное экранирование quote_literal само по себе не является SQL-инъекцией.',
      'm16-ex03':'Посчитайте выручку заказов хотя бы с одним успешным платежом, учитывая каждый заказ один раз. У заказа может быть несколько успешных платежей.',
    }
    for suffix,goal in goals.items():
        e=EXERCISES['sql-foundations-'+suffix]['exercise']
        e['instructions']=goal+' Выберите одну ошибочную строку и готовую замену всей строки. Другие строки менять нельзя.'
        e['description']=goal
    assert len(EXERCISES)==97, len(EXERCISES)
    return EXERCISES
