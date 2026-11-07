"""Back up the currently installed debuggable build before release testing."""
import subprocess,tarfile,json,hashlib
from pathlib import Path
from datetime import datetime
root=Path(__file__).resolve().parents[1]
folder=root/'artifacts'/('phone-backup-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
folder.mkdir(parents=True)
adb=r'C:\Users\vhnkg\AppData\Local\Android\Sdk\platform-tools\adb.exe'
package='ru.sluchaino.answerbook'
archive=folder/'app-data.tar'
with archive.open('wb') as output:
 result=subprocess.run([adb,'exec-out','run-as',package,'tar','-cf','-','.'],stdout=output,stderr=subprocess.PIPE)
if result.returncode:raise RuntimeError('Не удалось сохранить данные приложения; удаление запрещено')
with tarfile.open(archive) as saved:
 entries=saved.getmembers()
 if not entries:raise RuntimeError('Пустая резервная копия')
paths=subprocess.check_output([adb,'shell','pm','path',package],text=True).splitlines()
base=next(p.removeprefix('package:') for p in paths if p.endswith('/base.apk'))
subprocess.run([adb,'pull',base,str(folder/'installed-base.apk')],check=True,stdout=subprocess.DEVNULL)
report={'folder':str(folder),'dataBytes':archive.stat().st_size,'entries':len(entries),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'package':package}
(folder/'backup-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
