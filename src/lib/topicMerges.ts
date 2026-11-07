import type {Topic} from './catalog.ts'

export const topicMerges: Record<string,string> = {
  'csharp-operators':'csharp',
  'csharp-control-flow':'csharp',
  'csharp-methods':'csharp',
  'csharp-arrays-strings':'csharp',
  'csharp-custom-types':'csharp',
  'csharp-equality-null':'csharp',
  'csharp-generics':'csharp',
  'csharp-delegates-events':'csharp',
  'networks-http-tls':'http',
  'aspnet-hosting-config':'aspnet-core',
  'aspnet-routing':'aspnet-core',
  'aspnet-binding-results':'aspnet-core',
  'aspnet-middleware':'aspnet-core',
  'aspnet-di-options':'aspnet-core',
  'aspnet-minimal-api':'aspnet-core',
  'aspnet-controllers':'aspnet-core',
  'aspnet-validation-errors':'aspnet-core',
  'aspnet-http-background':'aspnet-core',
  'aspnet-auth-sessions':'backend-security',
  'aspnet-jwt-oauth':'backend-security',
  'aspnet-authorization':'backend-security',
  'aspnet-data-consistency':'ef-core',
  'aspnet-tasks-project':'rest-api-design',
  'dotnet-xunit-testing':'testing-test-design',
}
export const mergedTopicIds=(ids:string[])=>[...new Set(ids.map(id=>topicMerges[id]??id))]

export function mergeTopicSettings(settings:Record<string,boolean>) {
 const result=Object.fromEntries(Object.entries(settings).filter(([id])=>!topicMerges[id]))
 for(const [id,flag]of Object.entries(settings)){
  const target=topicMerges[id]
  if(target&&!Object.hasOwn(settings,target))result[target]=(result[target]??false)||flag
 }
 return result
}

// Stable IDs allow editing category boundaries without deleting answers or knowledge marks.
export const questionTopicOverrides:Record<string,string>={
 'csharp-pdf1-22-1':'dotnet-practical',
 'csharp-pdf1-33-12':'csharp-advanced',
 'csharp-pdf1-32-11':'csharp-advanced',
 'open-csharp-language-oop-members-2':'oop-design',
 'collections-linq-pdf2-29-7':'collections-linq',
 'open-csharp-language-oop-event-1':'dotnet-memory',
 'collections-linq-pdf2-31-2':'async-threading',
 'collections-linq-pdf2-21-4':'csharp',
 'collections-linq-pdf2-34-5':'rabbitmq-messaging',
 'open-csharp-collections-linq-events-queryable-1':'ef-core',
 'dotnet-practical-pdf4-5-1':'observability',
 'dotnet-practical-pdf4-7-3':'ef-core',
 'dotnet-practical-pdf4-9-5':'ef-core',
 'dotnet-practical-pdf4-10-6':'testing-test-design',
 'dotnet-practical-pdf4-11-7':'observability',
 'open-dotnet-engineering-tools-io-1':'aspnet-core',
 'open-dotnet-engineering-tools-testing-2':'aspnet-core',
 'open-dotnet-engineering-tools-host-options-1':'aspnet-core',
 'open-dotnet-engineering-tools-structured-logs-2':'observability',
 'survey-course-csharp-m01-05':'csharp',
 'open-rabbitmq-messaging-rabbit-outbox-1':'rabbitmq-messaging',
 'oop-design-011':'architecture-solid-patterns',
 'oop-design-013':'architecture-solid-patterns',
 'oop-design-014':'architecture-solid-patterns',
 'oop-design-015':'architecture-solid-patterns',
 'oop-design-016':'architecture-solid-patterns',
 'oop-design-017':'architecture-solid-patterns',
 'oop-design-018':'architecture-solid-patterns',
 'oop-design-pdf1-24-7':'architecture-solid-patterns',
 'oop-design-pdf1-25-8':'architecture-solid-patterns',
 'open-csharp-language-oop-solid-contracts-1':'testing-test-design',
 'survey-course-aspnet-m27-04':'testing-test-design',
 'survey-course-aspnet-m27-05':'dotnet-practical',
}
const descriptions:Record<string,{title:string;description:string}>={
 csharp:{title:'Основы языка C#',description:'Типы, переменные, операторы, условия и циклы, методы, массивы и строки, классы, структуры, обобщения, делегаты и события. Без веб-фреймворков и ORM.'},
 'dotnet-practical':{title:'Инструменты и инфраструктура .NET',description:'SDK и Runtime, CLI, настройки проекта, NuGet, зависимости и хранение конфигурации.'},
 'oop-design':{title:'ООП и проектирование типов',description:'Инкапсуляция, наследование, полиморфизм, абстракции, интерфейсы и контракты типов.'},
 http:{title:'Сети, HTTP и TLS',description:'DNS, IP, TCP, UDP, HTTP, HTTPS, TLS, заголовки, cookies, CORS и сетевые сбои.'},
 'aspnet-core':{title:'ASP.NET Core',description:'Хостинг, конфигурация, DI, маршруты, привязка данных, middleware, Minimal APIs, контроллеры и фоновая работа.'},
 'backend-security':{title:'Безопасность, аутентификация и авторизация',description:'Защита API, cookies и сеансы, JWT, OAuth, OpenID Connect, права доступа и ASP.NET Core Identity.'},
 'testing-test-design':{title:'Тестирование и автотесты .NET',description:'Тест-дизайн, unit- и интеграционные тесты, xUnit, mocks, контракты API и воспроизводимые проверки.'},
 'aspnet-realtime':{title:'Realtime: SignalR, SSE и gRPC',description:'Обмен данными в реальном времени, восстановление соединений и масштабирование.'},
}
export function organizeSurveyTopics(topics:Topic[]):Topic[]{
 const existing=new Set(topics.map(t=>t.id))
 const target=(id:string)=>existing.has(topicMerges[id])?topicMerges[id]:id
 const result=topics.filter(t=>target(t.id)===t.id).map((t,i)=>({...t,...descriptions[t.id],number:i+1,questions:[] as Topic['questions']}))
 const byId=new Map(result.map(t=>[t.id,t]))
 for(const t of topics)for(const q of t.questions){
  const override=questionTopicOverrides[q.id]
  const owner=byId.get(override?target(override):'')??byId.get(target(t.id))!
  owner.questions.push(q.id==='open-csharp-language-oop-runtime-2'?{...q,text:'Для чего нужна директива using пространства имён в C#?'}:q)
 }
 return result
}
// Kept as an alias for existing authoring scripts.
export const mergeBasicCsharpTopics=organizeSurveyTopics
