import type { Topic } from './catalog'

// Separate from course progress: these groups only control the catalog display.
export const topicDirections: Record<string, string> = {
  'csharp-operators':'dotnet', 'csharp-control-flow':'dotnet', 'csharp-methods':'dotnet', 'csharp-arrays-strings':'dotnet',
  'csharp-custom-types':'dotnet', 'csharp-equality-null':'dotnet', 'csharp-generics':'dotnet', 'csharp-delegates-events':'dotnet',
  'csharp-exceptions-resources':'dotnet', 'csharp-advanced':'dotnet',
  'aspnet-hosting-config':'web', 'aspnet-routing':'web', 'aspnet-binding-results':'web', 'aspnet-middleware':'web',
  'aspnet-di-options':'web', 'aspnet-minimal-api':'web', 'aspnet-controllers':'web', 'aspnet-validation-errors':'web',
  'aspnet-data-consistency':'storage', 'aspnet-auth-sessions':'web', 'aspnet-jwt-oauth':'web', 'aspnet-authorization':'web',
  'aspnet-http-background':'web', 'aspnet-realtime':'web', 'aspnet-tasks-project':'web',
  csharp:'dotnet', 'oop-design':'dotnet', 'collections-linq':'dotnet', 'dotnet-memory':'dotnet', 'async-threading':'dotnet', 'dotnet-practical':'dotnet',
  algorithms:'fundamentals',
  databases:'storage', postgresql:'storage', 'ef-core':'storage', 'redis-caching':'storage',
  http:'web', 'networks-http-tls':'web', 'aspnet-core':'web', 'rest-api-design':'web', 'backend-security':'web',
  'rabbitmq-messaging':'messaging',
  'testing-test-design':'quality', 'dotnet-xunit-testing':'quality', 'performance-load-testing':'quality',
  'git-workflow':'operations', 'linux-backend':'operations', 'docker-compose':'operations', 'ci-cd-delivery':'operations', observability:'operations',
  'architecture-solid-patterns':'architecture', 'distributed-systems':'architecture', 'system-design-reliability':'architecture',
}
const normalize = (text: string) => text.trim().toLocaleLowerCase('ru').replaceAll('ё','е')
export const topicDirection = (topic:Topic) => topic.id.startsWith('custom-') ? 'custom' : topicDirections[topic.id] ?? 'other'
export function groupTopics<T extends {id:string}>(topics:Topic[],directions:T[]) {
  return directions.map(direction=>({direction,topics:topics.filter(topic=>topicDirection(topic)===direction.id)})).filter(group=>group.topics.length>0)
}
export function filterTopics(topics: Topic[], query: string, direction: string): Topic[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return topics.filter(topic => {
    const text = normalize(`${topic.title} ${topic.description}`)
    return (direction === 'all' || topicDirection(topic) === direction) && words.every(word => text.includes(word))
  })
}
