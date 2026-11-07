"""Execute reviewed course SQL in a separate, locally authenticated PostgreSQL cluster."""
import json
import os
from pathlib import Path
import secrets
import re
import subprocess
import sys
import tempfile

workspace=Path(__file__).resolve().parents[1]
root=Path(sys.argv[1]).resolve()
tag=sys.argv[2] if len(sys.argv)>2 else 'original'
if not re.fullmatch(r'[a-z0-9-]+',tag): raise ValueError('Invalid audit tag')
base=Path(sys.argv[3]).resolve() if len(sys.argv)>3 else workspace/'.tools'/('sql-course-audit-'+tag+'-'+secrets.token_hex(4))
if not base.resolve().is_relative_to(workspace): raise ValueError('Cluster outside workspace')
if base.parent!=workspace/'.tools' or not base.name.startswith('sql-course-audit-'): raise ValueError('Unexpected cluster path')
base.mkdir(parents=True,exist_ok=True)
data=base/'data'
bin=Path('C:/MyApps/PostgreSQL/bin')
output=workspace/'artifacts'/('sql-course-runtime' if tag=='original' else 'sql-course-runtime-'+tag)
output.mkdir(parents=True,exist_ok=True)
pwfile=base/'password.txt'
password=pwfile.read_text(encoding='ascii') if pwfile.exists() else secrets.token_urlsafe(32)
pwfile.write_text(password,encoding='ascii')
env={**os.environ,'PGPASSWORD':password,'PGCLIENTENCODING':'UTF8','PGCONNECT_TIMEOUT':'3'}
port=os.environ.get('ANSWERBOOK_SQL_AUDIT_PORT','15432')
if not port.isdigit() or not 1024<=int(port)<=65535: raise ValueError('Invalid audit port')
records=[]

def command(args,timeout=60):
    if str(args[0]).endswith('pg_ctl.exe'):
        # Windows server children can keep inherited pipe handles open after pg_ctl exits.
        with tempfile.TemporaryFile() as capture:
            result=subprocess.run([str(a) for a in args],env=env,stdout=capture,stderr=capture,timeout=timeout)
            capture.seek(0)
            return subprocess.CompletedProcess(result.args,result.returncode,capture.read().decode('utf-8',errors='replace'),'')
    return subprocess.run([str(a) for a in args],env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)

if not data.exists():
    r=command([bin/'initdb.exe','-D',data,'-U','course_auditor','--pwfile',pwfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C'],300)
    (output/'initdb.log').write_text(r.stdout+r.stderr,encoding='utf-8')
    if r.returncode: raise RuntimeError('initdb failed; inspect initdb.log')
client=[bin/'psql.exe','-X','-h','127.0.0.1','-p',port,'-U','course_auditor','-d','postgres','-v','ON_ERROR_STOP=1']

def run_sql(label,sql=None,path=None):
    args=client+(['-f',path] if path else ['-c',sql])
    result=command(args,120)
    log=output/(label.replace('/','-')+'.log')
    log.write_text(result.stdout+result.stderr,encoding='utf-8')
    records.append({'label':label,'exitCode':result.returncode,'log':str(log.relative_to(workspace))})
    print(label,'PASS' if result.returncode==0 else 'FAIL',flush=True)

started=False
try:
    r=command([bin/'pg_ctl.exe','-D',data,'-l',base/'server.log','-o',f'-p {port} -h 127.0.0.1','-w','start'])
    if r.returncode: raise RuntimeError('Separate PostgreSQL failed to start')
    started=True
    # Match the explicit environment prerequisites in module 15, without editing its SQL.
    run_sql('environment-create-database',sql='CREATE DATABASE shopdb;')
    run_sql('environment-create-owner',sql='CREATE ROLE shopdb_owner NOLOGIN;')
    client[client.index('-d')+1]='shopdb'
    files=[]
    for number in range(7,17):
        directory=root/'modules'/f'module-{number:02}'/'examples'
        names=sorted(directory.glob('*.sql'))
        if number==8: names=[directory/name for name in ['shopdb_ddl_create.sql','shopdb_ddl_seed.sql','shopdb_ddl_verify.sql']]
        elif number==12: names=[directory/name for name in ['transaction_lab_setup.sql','transaction_practice.sql']]
        elif number==13: names=[directory/name for name in ['views_shopdb.sql','materialized_views_shopdb.sql','temporary_tables_practice.sql']]
        elif number==15: names=[directory/name for name in ['security_roles_setup.sql','row_level_security_lab.sql']]
        files.extend(path for path in names if not ('cleanup' in path.name or '_drop' in path.name))
    for path in files:
        text=path.read_text(encoding='utf-8-sig')
        if any(token in text.casefold() for token in ['\\!','copy program','alter system','pg_read_file','pg_write_file']):
            raise ValueError(f'Unexpected external operation in {path.name}')
        run_sql(path.relative_to(root).as_posix(),path=path)
    if (root/'interactive_contracts.json').exists():
        from sql_revision_runtime import verify_exercises
        verify_exercises(root,client,command,output,records,env)
    run_sql('refresh-concurrently-inside-transaction',sql='''
BEGIN;
CREATE TABLE public.audit_mv_source (id integer PRIMARY KEY, amount integer);
INSERT INTO public.audit_mv_source VALUES (1,100);
CREATE MATERIALIZED VIEW public.audit_mv AS SELECT * FROM public.audit_mv_source;
CREATE UNIQUE INDEX audit_mv_id ON public.audit_mv(id);
UPDATE public.audit_mv_source SET amount=150;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.audit_mv;
SELECT amount FROM public.audit_mv;
ROLLBACK;''')
    run_sql('rls-allowed-insert',sql='''BEGIN;
SET LOCAL ROLE shopdb_runtime;
SELECT set_config('shopdb.tenant_id','101',true);
INSERT INTO security_lab.tenant_orders (tenant_id,amount) VALUES (101,700.00) RETURNING order_id;
ROLLBACK;''')
    for number,name in [(16,'09_shopdb_capstone_cleanup.sql'),(12,'transaction_lab_drop.sql'),(8,'shopdb_ddl_drop.sql')]:
        path=root/'modules'/f'module-{number:02}'/'examples'/name
        run_sql(path.relative_to(root).as_posix(),path=path)
finally:
    if started:
        stop=command([bin/'pg_ctl.exe','-D',data,'-m','fast','-w','stop'])
        print('Separate cluster stopped:',stop.returncode==0)
    (output/'results.json').write_text(json.dumps({'postgresVersion':command([bin/'postgres.exe','--version']).stdout.strip(),'records':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

print(f"SQL files: {sum(r['label'].endswith('.sql') for r in records)}, failed checks: {sum(r['exitCode']!=0 for r in records)}")
sys.exit(1 if any(r['exitCode']!=0 for r in records) else 0)
