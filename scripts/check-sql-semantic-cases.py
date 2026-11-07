"""Independent runtime counterexamples for findings from the 1041-question reading."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile

workspace=Path(__file__).resolve().parents[1]
base=Path(sys.argv[1]).resolve()
if base.parent!=workspace/'.tools' or not base.name.startswith('sql-course-audit-'):raise ValueError('Unexpected cluster')
out=workspace/'artifacts/sql-semantic-runtime';out.mkdir(exist_ok=True)
bin=Path('C:/MyApps/PostgreSQL/bin')
env={**os.environ,'PGPASSWORD':(base/'password.txt').read_text(encoding='ascii'),'PGCLIENTENCODING':'UTF8','PGCONNECT_TIMEOUT':'3'}
client=[bin/'psql.exe','-X','-h','127.0.0.1','-p','15432','-U','course_auditor','-d','shopdb','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-A','-t','-q','-F','|']
cases=[]
def case(name,sql,expected=None,state=None,raw=False,exit_code=None):cases.append(dict(name=name,sql=sql,expected=expected,state=state,raw=raw,exitCode=exit_code))

case('from-subquery-alias-optional','SELECT * FROM (SELECT 7 AS n);',['7'])
case('scalar-in-one-column','SELECT 2 IN (VALUES (1),(2));',['t'])
case('row-in-two-columns','SELECT (1,2) IN (VALUES (1,2),(3,4));',['t'])
case('group-by-primary-key','CREATE TEMP TABLE t(id int PRIMARY KEY,name text); INSERT INTO t VALUES(1,\'A\'),(2,\'B\'); SELECT id,name,COUNT(*) FROM t GROUP BY id ORDER BY id;',['1|A|1','2|B|1'])
case('group-by-without-dependency','CREATE TEMP TABLE t(id int,name text); SELECT id,name,COUNT(*) FROM t GROUP BY id;',state='42803')
case('foreign-key-requires-parent-key','CREATE TEMP TABLE p(id int); CREATE TEMP TABLE c(pid int REFERENCES p(id));',state='42830')
case('foreign-key-does-not-create-child-index','CREATE TEMP TABLE p(id int); CREATE UNIQUE INDEX p_idx ON p(id); CREATE TEMP TABLE c(pid int REFERENCES p(id)); SELECT (SELECT count(*) FROM pg_index WHERE indrelid=\'p\'::regclass),(SELECT count(*) FROM pg_index WHERE indrelid=\'c\'::regclass);',['1|0'])
case('grant-insert-neither-create-nor-owner',"CREATE ROLE ab_semantic_reader NOLOGIN; CREATE TABLE t(id int); GRANT INSERT ON t TO ab_semantic_reader; SELECT has_table_privilege('ab_semantic_reader','t','INSERT'),has_schema_privilege('ab_semantic_reader','ab_semantic_audit','CREATE'),(SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) FROM pg_class WHERE oid='t'::regclass);",['t|f|t'])
case('view-read-through-select','CREATE VIEW v AS SELECT 42 AS n; SELECT n FROM v;',['42'])
case('view-not-procedure','CREATE VIEW v AS SELECT 42 AS n; CALL v();',state='42883')
case('like-underscore-exactly-one',"SELECT 'ТоварA' LIKE 'Товар_', 'Товар' LIKE 'Товар_', 'ТоварAB' LIKE 'Товар_';",['t|f|f'])
case('trivial-full-decomposition-is-lossless','CREATE TEMP TABLE r(a int,b int); INSERT INTO r VALUES(1,10),(2,20); SELECT (SELECT count(*) FROM r),(SELECT count(*) FROM (SELECT * FROM r) r1 NATURAL JOIN (SELECT * FROM r) r2);',['2|2'])
case('sum-count-null-and-zero','WITH t(x) AS (VALUES (0),(NULL::int),(2)) SELECT COUNT(*),COUNT(x),SUM(x),AVG(x)::numeric(4,2) FROM t;',['3|2|2|1.00'])
case('empty-scalar-null','SELECT (SELECT 1 WHERE false) IS NULL;',['t'])
case('multirow-scalar-error','SELECT (SELECT x FROM (VALUES(1),(2)) t(x));',state='21000')
case('unique-null-pairs-allowed','CREATE TEMP TABLE t(tenant int,external_id int,UNIQUE(tenant,external_id)); INSERT INTO t VALUES(1,NULL),(1,NULL); SELECT count(*) FROM t;',['2'])
case('unique-not-null-duplicate-rejected','CREATE TEMP TABLE t(tenant int NOT NULL,external_id int NOT NULL,UNIQUE(tenant,external_id)); INSERT INTO t VALUES(1,2),(1,2);',state='23505')
case('rank-dense-rank-desc','WITH t(id,score) AS (VALUES(1,100),(2,100),(3,90)) SELECT id,RANK() OVER(ORDER BY score DESC),DENSE_RANK() OVER(ORDER BY score DESC) FROM t ORDER BY id;',['1|1|1','2|1|1','3|3|2'])
case('ntile-eight-rows','WITH t AS (SELECT NTILE(4) OVER(ORDER BY id) AS bucket FROM generate_series(1,8) id) SELECT bucket,count(*) FROM t GROUP BY bucket ORDER BY bucket;',['1|2','2|2','3|2','4|2'])
case('rows-frame-at-partition-boundary','SELECT id,COUNT(*) OVER(ORDER BY id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) FROM generate_series(1,4) id;',['1|1','2|2','3|3','4|3'])
case('groups-frame-at-partition-boundary','WITH t(id,score) AS (VALUES(1,1),(2,1),(3,2),(4,3)) SELECT id,COUNT(*) OVER(ORDER BY score GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW) FROM t ORDER BY id;',['1|2','2|2','3|3','4|2'])
case('last-value-default-vs-full','SELECT id,LAST_VALUE(id) OVER(ORDER BY id),LAST_VALUE(id) OVER(ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) FROM generate_series(1,3) id;',['1|1|3','2|2|3','3|3|3'])
case('range-offset-requires-one-order-key',"SELECT SUM(x) OVER(ORDER BY x,y RANGE BETWEEN 1 PRECEDING AND CURRENT ROW) FROM (VALUES(1,2)) t(x,y);",state='42P20')
case('recursive-union-duplicate-terminates','WITH RECURSIVE t(n) AS (VALUES(1) UNION SELECT n FROM t) SELECT n FROM t;',['1'])
case('recursive-anchor-and-bound','WITH RECURSIVE t(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT n FROM t ORDER BY n;',['1','2','3','4','5'])
case('current-timestamp-is-transaction-time','CREATE TEMP TABLE t AS SELECT CURRENT_TIMESTAMP AS started,clock_timestamp() AS wall; SELECT pg_sleep(0.03); SELECT CURRENT_TIMESTAMP=started,clock_timestamp()>wall FROM t;',['t|t'])
case('commit-in-aborted-transaction',"\\set ON_ERROR_STOP off\nCREATE TEMP TABLE t(id int);\nBEGIN;\nINSERT INTO t VALUES(1);\nSELECT 1/0;\nCOMMIT;\nSELECT count(*) FROM t;",['0'],state='22012',raw=True,exit_code=0)
case('on-commit-drop-autocommit',"CREATE TEMP TABLE ab_drop_test(id int) ON COMMIT DROP; SELECT to_regclass('ab_drop_test') IS NULL;",['t'],raw=True)
case('check-null-not-rejected','CREATE TEMP TABLE t(price numeric CHECK(price>0)); INSERT INTO t VALUES(NULL); SELECT count(*) FROM t WHERE price IS NULL;',['1'])
case('savepoint-release-not-commit','CREATE TEMP TABLE t(id int); SAVEPOINT s; INSERT INTO t VALUES(1); RELEASE s; SELECT count(*) FROM t;',['1'])
case('left-chain-preserves-missing-items','WITH o(id) AS (VALUES(1),(2)), i(oid,pid) AS (VALUES(1,10)),p(id) AS (VALUES(10)) SELECT o.id,p.id IS NULL FROM o LEFT JOIN i ON i.oid=o.id LEFT JOIN p ON p.id=i.pid ORDER BY o.id;',['1|f','2|t'])
case('scalar-not-in-null','SELECT (103 NOT IN (101,NULL)) IS NULL,15>ANY(ARRAY[]::int[]),15>ALL(ARRAY[]::int[]);',['t|f|t'])
case('correlated-exists-no-duplicate-payments',"WITH orders(id,total) AS (VALUES(1,250),(2,250)),payments(oid,status) AS (VALUES(1,'succeeded'),(1,'succeeded'),(2,'failed')) SELECT SUM(total) FROM orders o WHERE EXISTS(SELECT 1 FROM payments p WHERE p.oid=o.id AND p.status='succeeded');",['250'])
case('security-definer-trusted-path',"CREATE TABLE secret_value(v int); INSERT INTO secret_value VALUES(42); CREATE TEMP TABLE secret_value(v int); INSERT INTO pg_temp.secret_value VALUES(0); CREATE FUNCTION ab_semantic_audit.safe_value() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path=ab_semantic_audit,pg_temp AS 'SELECT v FROM secret_value'; CREATE FUNCTION ab_semantic_audit.unsafe_value() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path=ab_semantic_audit AS 'SELECT v FROM secret_value'; SELECT ab_semantic_audit.safe_value(),ab_semantic_audit.unsafe_value();",['42|0'])
case('date-day-half-open',"WITH t(d) AS (VALUES(TIMESTAMP '2026-01-10 00:00'),(TIMESTAMP '2026-01-10 23:59:59.999999'),(TIMESTAMP '2026-01-11 00:00')) SELECT count(*) FROM t WHERE d>=TIMESTAMP '2026-01-10' AND d<TIMESTAMP '2026-01-11';",['2'])

def ctl(args):
    with tempfile.TemporaryFile() as capture:
        result=subprocess.run([str(x) for x in args],env=env,stdout=capture,stderr=capture,timeout=60)
        capture.seek(0);return result.returncode,capture.read().decode('utf8',errors='replace')
def run_sql(sql,name):
    file=out/(name+'.sql');file.write_text(sql,encoding='utf8')
    return subprocess.run([str(x) for x in client]+['-f',str(file)],env=env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=30)
started=False;records=[]
try:
    result,_=ctl([bin/'pg_ctl.exe','-D',base/'data','-l',base/'server.log','-o','-p 15432 -h 127.0.0.1','-w','start'])
    if result:raise RuntimeError('Audit cluster failed to start')
    started=True
    for c in cases:
        sql=c['sql'] if c['raw'] else 'BEGIN; CREATE SCHEMA ab_semantic_audit; SET LOCAL search_path=ab_semantic_audit,pg_catalog;\n'+c['sql']+'\nROLLBACK;'
        result=run_sql(sql,c['name'])
        actual=[x for x in result.stdout.splitlines() if x.strip()]
        expected_code=c['exitCode'] if c['exitCode'] is not None else (3 if c['state'] else 0)
        passed=result.returncode==expected_code and (c['expected'] is None or actual==c['expected']) and (not c['state'] or c['state'] in result.stderr)
        (out/(c['name']+'.log')).write_text(result.stdout+result.stderr,encoding='utf8')
        records.append({'name':c['name'],'passed':passed,'expected':c['expected'],'actual':actual,'expectedSqlState':c['state'],'processExitCode':result.returncode})
        print(c['name'],'PASS' if passed else 'FAIL',flush=True)
    # Check EXPLAIN's numeric fields directly instead of relying on rendered text rounding.
    plan=run_sql('EXPLAIN (ANALYZE,FORMAT JSON) SELECT g,x FROM generate_series(1,3) g CROSS JOIN LATERAL (SELECT x FROM generate_series(1,g) x OFFSET 0) q;','explain-average-loops')
    def nodes(node):
        yield node
        for child in node.get('Plans',[]):yield from nodes(child)
    parsed=json.loads(plan.stdout)
    found=[n for n in nodes(parsed[0]['Plan']) if n.get('Actual Loops')==3 and n.get('Actual Rows')==2]
    passed=plan.returncode==0 and bool(found)
    (out/'explain-average-loops.log').write_text(plan.stdout+plan.stderr,encoding='utf8')
    records.append({'name':'explain-average-loops','passed':passed,'actual':[{'loops':x['Actual Loops'],'rows':x['Actual Rows']} for x in found]})
    print('explain-average-loops','PASS' if passed else 'FAIL',flush=True)
finally:
    stopped=False
    if started:
        result,_=ctl([bin/'pg_ctl.exe','-D',base/'data','-m','fast','-w','stop']);stopped=result==0
        print('Separate cluster stopped:',stopped)
    (out/'results.json').write_text(json.dumps({'postgresVersion':subprocess.run([str(bin/'postgres.exe'),'--version'],capture_output=True,text=True).stdout.strip(),'clusterStopped':stopped,'records':records},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
sys.exit(0 if records and all(r['passed'] for r in records) and stopped else 1)
