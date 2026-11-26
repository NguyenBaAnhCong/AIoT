$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!$env:JAVA_HOME -or !(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
    $jdk = Get-ChildItem -LiteralPath 'C:\Program Files\Java' -Directory -Filter 'jdk*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (!$jdk) { throw 'Cần cài JDK 17 trở lên và đặt JAVA_HOME.' }
    $env:JAVA_HOME = $jdk.FullName
}
& .\mvnw.cmd -B -q package '-DskipTests'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $env:JAVA_HOME 'bin/java.exe') -jar target/tv5-java-1.0.0.jar
exit $LASTEXITCODE
