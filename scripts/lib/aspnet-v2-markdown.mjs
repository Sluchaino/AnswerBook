// MVC validates positional records through constructor parameter metadata.
// Keep original supplied files intact and repair the learner-facing examples.
export function normalizeAspNetV2Authentication(markdown,context){
 if(context.number>=26){
  let code=false
  const paragraphs=markdown.split('\n\n').map(block=>{
   const lines=block.split('\n');if(lines.some(l=>l.startsWith('```'))){for(const l of lines)if(l.startsWith('```'))code=!code;return block}
   if(code||lines.some(l=>/^\s*[-*|]/.test(l)))return block
   return lines.map(l=>l.trim()).join(' ')
  })
  markdown=paragraphs.join('\n\n').replace(/^(#{1,3} [^\n]*?) --- /gm,'$1 — ').replace(/^# Урок \d+\. /m,'# ')
 }
 // Keep author reference links in sources, outside learner-facing theory.
 if(context.kind==='lesson')markdown=markdown.replace(/^\*\*Документация:\*\*[^\n]*$/gm,'')
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2Storage(markdown,context){
 // The shared Product model requires Sku; accept it explicitly in this DTO.
 if(context.kind==='lesson'&&context.lesson===1)markdown=markdown.replace('        Name = request.Name,','        Sku = request.Sku,\n        Name = request.Name,').replace('CreateProductRequest(string Name, decimal Price, int CategoryId)','CreateProductRequest(string Sku, string Name, decimal Price, int CategoryId)')
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2Advanced(markdown,context){
 // The shared Product from module 11 requires Sku in object initializers.
 if(context.kind==='lesson')markdown=markdown.replace('new Product { Id = 7, Name = "Из HTTP" }','new Product { Id = 7, Sku = "HTTP-7", Name = "Из HTTP" }').replace('new Product { Name = "Кабель", Price = 120m, Category = category }','new Product { Sku = "CABLE-120", Name = "Кабель", Price = 120m, Category = category }')
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2Rest(markdown,context){
 // Repair invalid escaped quotes in the supplied ETag interpolation.
 if(context.kind==='lesson')markdown=markdown.replaceAll('$""v{version}""','$"\\"v{version}\\""')
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2Errors(markdown,context){
 // Throw-only expression lambdas need an explicit return type for MapGet.
 if(context.kind==='lesson')markdown=markdown.replace(/\(\) =>(\s+)throw /g,'IResult () =>$1throw ')
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2Controllers(markdown,context){
 if(context.kind==='lesson')markdown=markdown.replaceAll('[property: Required]','[param: Required]').replaceAll('[property: StringLength','[param: StringLength').replaceAll('[property: Range(1, 1_000_000)]','[param: Range(typeof(decimal), "1", "1000000", ParseLimitsInInvariantCulture = true)]')
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2Middleware(markdown,context){
 if(context.kind==='lesson'){
  markdown=markdown.replaceAll('TypedResults.Accepted()','TypedResults.Accepted((string?)null)')
  markdown=markdown.replace(/```csharp\n([\s\S]*?)```/g,(full,code)=>code.includes('AddFixedWindowLimiter(')&&!code.includes('using Microsoft.AspNetCore.RateLimiting;')?'```csharp\nusing Microsoft.AspNetCore.RateLimiting;\n\n'+code+'```':full)
 }
 return normalizeAspNetV2(markdown,context)
}
export function normalizeAspNetV2(markdown,{number,lesson,kind}){
 const prefix=`M${String(number).padStart(2,'0')}`,id=(type,index,n)=>type==='К'?`${prefix}-EX-${String(index).padStart(2,'0')}`:`${prefix}-L${String(n).padStart(2,'0')}-${type==='М'?'P':'F'}${index}`
 if(kind==='key'){
  let current;const entries=[],lines=markdown.split('\n')
  for(let i=0;i<lines.length;i++){
   const inlineLesson=lines[i].match(/^### Урок (\d+)\s*—/);if(inlineLesson)current=Number(inlineLesson[1])
   const h=lines[i].match(/^## Урок (\d+)\s*[—.]/);if(h)current=Number(h[1])
   if(/^## Контрольный тест/.test(lines[i]))current=undefined
   const q=lines[i].replace(/^### (?:Урок \d+|Модуль \d+|Контрольный тест)\s*—\s*/,'### ').match(/^### ([МИК])(\d+)\s*$/);if(!q)continue
   if(q[1]!=='К'&&!current)throw Error('Ключ без урока')
   let end=i+1;while(end<lines.length&&!/^#{2,3} /.test(lines[end]))end++
   const body=lines.slice(i+1,end).join('\n'),answer=body.match(/\*\*Правильный ответ:\*\*\s+([A-D])\b/)?.[1],why=body.match(/\*\*Объяснение:\*\*\s+([\s\S]+)/)?.[1]?.trim()
   if(!answer||!why)throw Error('Неверный ключ '+q[0]);entries.push(`### ${id(q[1],q[2],current)} · ключ\n\n**Ответ:** ${answer}.\n\n**Обоснование:** ${why}\n`)
  }
  return entries.join('\n')
 }
 let inCode=false
 return markdown.split('\n').map(line=>{
  if(line.startsWith('```')){inCode=!inCode;return line}if(inCode)return line
  if(line.startsWith('**Рекомендуемый интерактив:**')||/^\*\*(?:Источники|Источник)(?:\s|:)/.test(line))return ''
  if(kind==='lesson'&&line.startsWith('# '))return `# Модуль ${number}. Урок ${lesson}. ${line.slice(2)}`
  const mini=line.match(/^## Мини-тест М([12])\s*$/);if(mini)return `### Мини-тест ${mini[1]} — закрепление во время урока`
  if(line==='## Итоговая проверка')return '## Итоговый тест урока'
  const q=line.match(/^\*\*([МИ])(\d+)\. (.+)\*\*\s*$/)??line.match(/^### ([МИК])(\d+)\. (.+)$/)??line.match(/^## ([К])(\d+)\. (.+)$/)
  if(q)return `**${id(q[1],q[2],lesson)} · Выберите один вариант.**\n\n${q[3]}`
  return line.replace(/^([A-D])\. /,'- **$1.** ')
 }).join('\n')
}
