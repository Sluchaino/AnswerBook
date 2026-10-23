import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const env = { ...process.env }
if (!env.JAVA_HOME) {
  const candidates = [join(process.cwd(), '.tools/jdk-21'), 'C:/MyApps/Android Studio/jbr', 'C:/Program Files/Android/Android Studio/jbr']
  env.JAVA_HOME = candidates.find(path => existsSync(join(path, 'bin/java.exe')))
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const sdk = join(env.USERPROFILE || '', 'AppData/Local/Android/Sdk')
  if (existsSync(sdk)) env.ANDROID_HOME = sdk
}
if (!env.JAVA_HOME) throw new Error('Укажите JAVA_HOME — путь к JDK из Android Studio')
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) throw new Error('Укажите ANDROID_HOME — путь к Android SDK')
const windows = process.platform === 'win32'
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d', '/c', 'gradlew.bat :app:assembleDebug --console=plain'] : [':app:assembleDebug', '--console=plain'], { cwd: 'android', env, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const gradle = readFileSync('android/app/build.gradle', 'utf8')
const version = gradle.match(/versionName\s+"([\d.]+)"/)?.[1]
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1])
if (!version || !versionCode) throw new Error('Не найден номер Android-сборки')
mkdirSync('artifacts', { recursive: true })
const target = join('artifacts', `AnswerBook-${version}-mobile.apk`)
copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', target)
const apk = readFileSync(target)
const sha256 = createHash('sha256').update(apk).digest('hex')
writeFileSync(`${target}.json`, JSON.stringify({ version, versionCode, bytes: apk.length, sha256, builtAt: new Date().toISOString() }, null, 2))
console.log(`\nAPK: ${target}\nВерсия: ${version} (${versionCode})\nSHA256: ${sha256}`)
