import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateCatalog, sessionTopics, downloadCatalog } from '../src/lib/catalog.ts'

const bundled = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url), 'utf8'))
test('bundled questions remain usable on first offline launch', () => {
  const catalog = validateCatalog(bundled)
  assert.ok(catalog.topics.length > 0)
  assert.deepEqual(catalog, bundled)
})
test('rejects corrupt catalogs and duplicate IDs rather than replacing offline data', () => {
  for (const invalid of [null, {}, { topics: [] }, { topics: [{ id: 'broken' }] }]) assert.throws(() => validateCatalog(invalid))
  const duplicate = structuredClone(bundled)
  duplicate.topics[1].questions[0].id = duplicate.topics[0].questions[0].id
  assert.throws(() => validateCatalog(duplicate))
})
test('a downloaded change does not alter an in-progress session or its restored snapshot', () => {
  const snapshot = structuredClone(bundled.topics)
  const downloaded = structuredClone(bundled.topics)
  downloaded[0].questions[0].text = 'Новая редакция вопроса'
  downloaded[0].questions.push({ id: 'new-question', text: 'Новый вопрос' })
  const restored = sessionTopics(JSON.parse(JSON.stringify(snapshot)), downloaded)
  assert.equal(restored[0].questions[0].text, bundled.topics[0].questions[0].text)
  assert.equal(restored[0].questions.length, bundled.topics[0].questions.length)
  assert.equal(sessionTopics(undefined, downloaded)[0].questions.length, bundled.topics[0].questions.length + 1)
})
test('a malformed legacy snapshot falls back to the available offline catalog', () => {
  assert.equal(sessionTopics([], bundled.topics), bundled.topics)
})

test('network errors, invalid JSON, duplicate IDs and HTTP errors preserve the offline copy', async () => {
  let saved = bundled
  const persist = async catalog => { saved = catalog }
  const invalid = structuredClone(bundled)
  invalid.topics[1].id = invalid.topics[0].id
  for (const fetcher of [
    async () => { throw new Error('offline') },
    async () => new Response('<html>error</html>'),
    async () => new Response(JSON.stringify(invalid)),
    async () => new Response('Unavailable', { status: 503 }),
  ]) {
    await assert.rejects(downloadCatalog('https://example.test/questions', persist, fetcher))
    assert.equal(saved, bundled)
  }
})

test('validated updates are persisted before they become available; failed saves are not applied', async () => {
  const next = structuredClone(bundled)
  next.topics[0].questions.push({ id: 'downloaded-new', text: 'Новый вопрос из интернета' })
  let persisted = false
  const fetcher = async () => new Response(JSON.stringify(next))
  const result = await downloadCatalog('https://example.test/questions', async () => { persisted = true }, fetcher)
  assert.equal(persisted, true)
  assert.equal(result.topics[0].questions.length, bundled.topics[0].questions.length + 1)
  await assert.rejects(downloadCatalog('https://example.test/questions', async () => { throw new Error('storage full') }, fetcher))
})
