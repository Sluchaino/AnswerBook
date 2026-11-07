import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const policy=JSON.parse(fs.readFileSync(path.join(root,'src/data/privacy-policy.json'),'utf8'))
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>КодШаг — политика конфиденциальности</title><link rel="canonical" href="${escape(policy.publicUrl)}"><style>body{font:16px/1.8 system-ui,sans-serif;color:#18233c;background:#f3f5fa;margin:0}main{max-width:820px;margin:auto;padding:28px 22px}h1{font-size:28px;line-height:1.3}h2{font-size:21px;margin-top:30px}a{color:#315de5;overflow-wrap:anywhere}p{white-space:pre-line}@media(prefers-color-scheme:dark){body{background:#151a26;color:#edf1ff}a{color:#a8bcff}}</style></head><body><main><a href="./">← КодШаг</a><h1>Политика конфиденциальности КодШаг</h1><p>Редакция от ${escape(policy.date)} · ${escape(policy.version)}</p><p>${escape(policy.developer)}</p>${policy.sections.map(s=>`<section><h2>${escape(s.title)}</h2><p>${escape(s.text)}</p></section>`).join('')}<p>По вопросам данных: <a href="mailto:${escape(policy.email)}">${escape(policy.email)}</a>.</p></main></body></html>`
fs.mkdirSync(path.join(root,'public'),{recursive:true})
fs.writeFileSync(path.join(root,'public/privacy.html'),html+'\n','utf8')
console.log('Privacy page generated: '+policy.version)
