import './code-example.css'

export function CodeExample({code}:{code:string}){
  return <pre className="code-example"><code>{code}</code></pre>
}

// Render only text, never HTML or executable code from a downloaded course.
export function QuestionText({text}:{text:string}){
  const parts=text.split(/(```[^\n]*\n[\s\S]*?```|`[^`]+`)/g)
  return <span className="question-rich-text">{parts.map((part,i)=>part.startsWith('```')?
    <span className="question-code-block" key={i}><code>{part.replace(/^```[^\n]*\n/,'').replace(/```$/,'').replace(/\n$/,'')}</code></span>:
    part.startsWith('`')&&part.endsWith('`')?<code className="question-inline-code" key={i}>{part.slice(1,-1)}</code>:part)}</span>
}
