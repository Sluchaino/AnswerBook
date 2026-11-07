"""Package and verify the prepared AnswerBook revision without cloud writes."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
staging = ROOT / 'artifacts/s3-upload/revision-271'
catalog = json.loads((staging / 'catalog.json').read_text(encoding='utf-8'))
assert catalog['revision'] == 271
expected = {'catalog.json'} | {'courses/' + course['file'] for course in catalog['courses']}
actual = {p.relative_to(staging).as_posix() for p in staging.rglob('*') if p.is_file()}
assert actual == expected, (actual, expected)
archive = ROOT / 'artifacts/AnswerBook-Yandex-Cloud-revision-271.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in sorted(expected):
        z.write(staging / name, name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert set(z.namelist()) == expected
    assert json.loads(z.read('catalog.json')) == catalog
    for course in catalog['courses']:
        data = z.read('courses/' + course['file'])
        assert len(data) == course['bytes']
        assert hashlib.sha256(data).hexdigest() == course['sha256']
        payload = json.loads(data)
        assert payload['id'] == course['id']
        assert payload['version'] == course['version']
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size,
                  'revision': catalog['revision'], 'files': sorted(expected),
                  'crcAndHashesVerified': True}, ensure_ascii=False, indent=2))
