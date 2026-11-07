$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$keytoolPath = Join-Path $projectRoot '.tools\jdk-21\bin\keytool.exe'
$signingDirectory = Join-Path $projectRoot '.tools\signing'
$keystorePath = Join-Path $signingDirectory 'answerbook-release.jks'

if (-not (Test-Path -LiteralPath $keytoolPath)) {
    throw 'Project JDK keytool was not found.'
}
if (Test-Path -LiteralPath $keystorePath) {
    throw "A signing key already exists. It will NOT be overwritten: $keystorePath"
}
New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
Write-Host 'Create the permanent AnswerBook release key.'
Write-Host 'Choose a strong password and save it in your password manager.'
Write-Host 'Password input is hidden. Do not send the password in chat.'
Write-Host 'After confirming the store password, press Enter at the key password prompt to use the same password.'
Write-Host ''
& $keytoolPath -genkeypair -storetype JKS -keystore $keystorePath -alias answerbook-release -keyalg RSA -keysize 3072 -validity 10958 -dname 'CN=Maksim Sergeevich Denisov, C=RU'
if ($LASTEXITCODE -ne 0) {
    throw 'Key creation did not finish successfully.'
}
if (-not (Test-Path -LiteralPath $keystorePath)) {
    throw 'The keystore file was not created.'
}
Write-Host ''
Write-Host "Created: $keystorePath" -ForegroundColor Green
Write-Host 'Alias: answerbook-release'
Write-Host 'Back up this file and its password separately. Keep this key for all releases.'
