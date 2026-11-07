"""Re-run exercise SQL after fixture-only fixes using a known stopped audit cluster."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
from sql_revision_runtime import verify_exercises

workspace=Path(__file__).resolve().parents[1]
root=Path(sys.argv[1]).resolve()
base=Path(sys.argv[2]).resolve()
if base.parent!=workspace/'.tools' or not base.name.startswith('sql-course-audit-'):raise ValueError('Unexpected cluster')
out=workspace/'artifacts/sql-course-runtime-revised-2026-11-04'
previous=json.loads((out/'results.json').read_text(encoding='utf8'))
failed={r['label'].split('-solution-')[0] for r in previous['records'] if r['exitCode'] and '-solution-' in r['label']}
if not failed or any(not x.startswith('sql-foundations-') for x in failed):raise ValueError('No eligible failed cases')
env={**os.environ,'PGPASSWORD':(base/'password.txt').read_text(encoding='ascii'),'PGCLIENTENCODING':'UTF8','PGCONNECT_TIMEOUT':'3'}
bin=Path('C:/MyApps/PostgreSQL/bin')
def command(args,timeout=60):
    with tempfile.TemporaryFile() as capture:
        result=subprocess.run([str(a) for a in args],env=env,stdout=capture,stderr=capture,timeout=timeout)
        capture.seek(0)
        return subprocess.CompletedProcess(result.args,result.returncode,capture.read().decode('utf8',errors='replace'),'')
# Client output and error must be distinct for the runtime helper's two-session checks.
def client_command(args,timeout=60):
    return subprocess.run([str(a) for a in args],env=env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=timeout)
started=False
try:
    result=command([bin/'pg_ctl.exe','-D',base/'data','-l',base/'server.log','-o','-p 15432 -h 127.0.0.1','-w','start'])
    if result.returncode:raise RuntimeError('Audit cluster failed to start')
    started=True
    rows=[]
    verify_exercises(root,[bin/'psql.exe','-X','-h','127.0.0.1','-p','15432','-U','course_auditor','-d','shopdb','-v','ON_ERROR_STOP=1'],client_command,out,rows,env,failed)
    (out/'fixture-fix-rerun.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    old={r['label']:r for r in previous['records']}
    old.update({r['label']:r for r in rows})
    previous['records']=list(old.values())
    previous['fixtureRerunNote']='Three solution checks repeated after UTF-8 fixtures, no-op ALTER and schema-remapping fixes. Course SQL itself did not require changes.'
    (out/'results.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
finally:
    if started:
        result=command([bin/'pg_ctl.exe','-D',base/'data','-m','fast','-w','stop'])
        print('Separate cluster stopped:',result.returncode==0)
count=sum(r['exitCode']!=0 for r in previous['records'])
print('Failed checks remaining:',count)
sys.exit(1 if count else 0)
