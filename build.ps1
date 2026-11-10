$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimeFiles = @('index.html','style.css','interface.css','progression.js','automation.js','interface.js','preparation.js','base-scene.js','arena.js','game.js')
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
foreach ($file in $runtimeFiles) { Copy-Item -LiteralPath $file -Destination (Join-Path 'dist' $file) -Force }
& tar.exe -a -c -f XENOCIDE-OUTPOST-offline.zip -C dist @runtimeFiles
if ($LASTEXITCODE -ne 0) { throw 'ZIP build failed' }
Write-Output 'Built dist/ and XENOCIDE-OUTPOST-offline.zip'
