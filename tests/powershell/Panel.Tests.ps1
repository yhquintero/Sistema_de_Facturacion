#Requires -Version 7.4
[CmdletBinding()]
param([switch]$Integration)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
function Assert-True([bool]$Condition,[string]$Message) { if (!$Condition) { throw $Message } }
foreach ($file in Get-ChildItem (Join-Path $repository 'control') -File) {
    if ($file.Extension -notin @('.ps1','.psm1')) { continue }
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors) | Out-Null
    Assert-True ($errors.Count -eq 0) ("Error de sintaxis en " + $file.Name + ': ' + ($errors | Out-String))
}
Import-Module (Join-Path $repository 'control/Nexo.Control.psm1') -Force
$module = Get-Module Nexo.Control
$state = Join-Path ([IO.Path]::GetTempPath()) ('nexo-ps-ci-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $state | Out-Null
try {
    & $module {
        param($State)
        # Debe explicar cómo instalar el requisito, sin filtrar el error de Get-Command.
        $originalPath = $env:PATH
        try {
            $env:PATH = $State
            $message = ''
            try { Get-CaddyPath | Out-Null } catch { $message = $_.Exception.Message }
            if ($message -notmatch 'Caddy no está instalado o no está en PATH' -or $message -notmatch 'winget install --id CaddyServer\.Caddy --exact --source winget' -or $message -notmatch 'caddy version') { throw 'Falta diagnóstico accionable para Caddy ausente.' }
            # Con PATH vacío debe fallar por Caddy antes de intentar Node/npm o pedir secretos.
            foreach ($action in @('Start','Menu','Initialize')) {
                $message = ''
                try { Invoke-NexoControl -Action $action -InstallDependencies -StateDirectory (Join-Path $State $action) } catch { $message = $_.Exception.Message }
                if ($message -notmatch 'Caddy no está instalado o no está en PATH') { throw "No se comprobó Caddy antes de instalar dependencias para $action : $message" }
                if (Test-Path (Join-Path $State "$action/control.json")) { throw 'No se debe crear configuración sin Caddy.' }
            }
        } finally { $env:PATH = $originalPath }
        # npm ci: reintenta los cortes de red reutilizando la caché, no reintenta un lockfile desincronizado,
        # no vuelve a descargar si nada cambió y explica qué hacer cuando la red no responde.
        $originalRepository = $script:Repository; $originalRunner = $script:NpmRunner
        $fakeRepository = Join-Path $State 'npm-repo'; New-Item -ItemType Directory -Path $fakeRepository | Out-Null
        Set-Content -LiteralPath (Join-Path $fakeRepository 'package-lock.json') -Value '{"lockfileVersion":3}' -NoNewline
        try {
            $script:Repository = $fakeRepository
            $script:NpmCalls = [Collections.Generic.List[object]]::new()
            $script:NpmScript = @(@{ ExitCode = 1; Output = "npm error code ECONNRESET`nnpm error network read ECONNRESET" }, @{ ExitCode = 1; Output = 'npm error code ETIMEDOUT' }, @{ ExitCode = 0; Output = 'added 300 packages' })
            $script:NpmRunner = {
                param([string[]] $Arguments)
                $script:NpmCalls.Add($Arguments)
                $next = $script:NpmScript[[Math]::Min($script:NpmCalls.Count - 1, $script:NpmScript.Count - 1)]
                if ($next.ExitCode -eq 0) { New-Item -ItemType Directory -Path (Join-Path $script:Repository 'node_modules/tsx') -Force | Out-Null; Set-Content -LiteralPath (Join-Path $script:Repository 'node_modules/tsx/package.json') -Value '{}' }
                [PSCustomObject]$next
            }
            Install-Dependencies -DelaySeconds @(0)
            if ($script:NpmCalls.Count -ne 3) { throw "Se esperaban 3 intentos de npm ci tras dos cortes de red: $($script:NpmCalls.Count)" }
            $first = $script:NpmCalls[0]
            if ($first[0] -ne 'ci' -or '--prefer-offline' -notin $first -or !($first -match '^--fetch-retries=')) { throw 'npm ci debe reutilizar la caché y reintentar cada descarga.' }
            if (!(Test-DependenciesCurrent)) { throw 'Tras instalar, la marca del lockfile debe coincidir.' }
            $script:NpmCalls.Clear(); Install-Dependencies -DelaySeconds @(0)
            if ($script:NpmCalls.Count -ne 0) { throw 'Con dependencias al día no se debe volver a ejecutar npm ci.' }
            foreach ($bad in @('http://registry.example/', 'https://usuario:clave@registry.example/', 'no-es-una-url')) {
                $message = ''; try { Install-Dependencies -Registry $bad -DelaySeconds @(0) } catch { $message = $_.Exception.Message }
                if ($message -notmatch 'https://') { throw "Registro no seguro aceptado: $bad" }
            }
            Set-Content -LiteralPath (Join-Path $fakeRepository 'package-lock.json') -Value '{"lockfileVersion":3,"cambio":1}' -NoNewline
            $script:NpmCalls.Clear(); $script:NpmScript = @(@{ ExitCode = 1; Output = "npm error code EUSAGE`nnpm error npm ci can only install packages when your package.json and package-lock.json are in sync." })
            $message = ''; try { Install-Dependencies -DelaySeconds @(0) } catch { $message = $_.Exception.Message }
            if ($script:NpmCalls.Count -ne 1 -or $message -notmatch 'no coinciden') { throw "Un lockfile desincronizado no se reintenta y debe explicarse: $message" }
            $script:NpmCalls.Clear(); $script:NpmScript = @(@{ ExitCode = 1; Output = "npm error code ECONNRESET`nnpm error network read ECONNRESET" })
            $message = ''; try { Install-Dependencies -MaxAttempts 3 -DelaySeconds @(0) } catch { $message = $_.Exception.Message }
            if ($script:NpmCalls.Count -ne 3 -or $message -notmatch 'npm ping' -or $message -notmatch '-NpmRegistry' -or $message -notmatch 'caché') { throw "Falta un diagnóstico de red accionable: $message" }
            $script:NpmCalls.Clear(); $script:NpmScript = @(@{ ExitCode = 0; Output = 'added 300 packages' })
            Install-Dependencies -Registry 'https://registry.npmmirror.com/' -DelaySeconds @(0)
            if ('--registry=https://registry.npmmirror.com/' -notin $script:NpmCalls[0]) { throw 'El registro alternativo no se pasó a npm ci.' }
            $kinds = @{ 'npm error code EPERM' = 'Locked'; 'npm error code SELF_SIGNED_CERT_IN_CHAIN' = 'Certificate'; 'npm error code E407' = 'Proxy'; 'npm error code EAI_AGAIN' = 'Network'; 'npm error code E503' = 'Network'; 'npm error code ERESOLVE' = 'Other' }
            foreach ($entry in $kinds.GetEnumerator()) { if ((Get-NpmFailureKind $entry.Key) -ne $entry.Value) { throw "Clasificación npm incorrecta para '$($entry.Key)': $(Get-NpmFailureKind $entry.Key)" } }
            $message = ''; try { Invoke-NexoControl -Action Status -NpmRegistry 'https://registry.npmmirror.com/' -StateDirectory (Join-Path $State 'registry-only') } catch { $message = $_.Exception.Message }
            if ($message -notmatch 'junto con -InstallDependencies') { throw 'NpmRegistry sin -InstallDependencies debe rechazarse.' }
        } finally { $script:Repository = $originalRepository; $script:NpmRunner = $originalRunner }
        Set-PrivatePermissions $State
        $file = Join-Path $State 'atomic.json'
        Write-PrivateJson $file @{ test = 1 }
        Write-PrivateJson $file @{ test = 2 }
        if ((Get-Content $file -Raw | ConvertFrom-Json).test -ne 2) { throw 'La escritura atómica no conservó la versión nueva.' }
        if ($IsWindows) {
            $rules = @((Get-Acl -LiteralPath $State).Access)
            if ($rules.Count -ne 2 -or @($rules | Where-Object IsInherited).Count) { throw 'La DACL no contiene únicamente operador y SYSTEM.' }
        }
        $current = Get-Process -Id $PID
        $record = [PSCustomObject]@{ processId = $PID; startTicks = ($current.StartTime.ToUniversalTime().Ticks + 1); executable = $current.Path }
        if (Get-OwnedProcess $record) { throw 'La identidad de un PID reutilizado no fue rechazada.' }
        # Nunca llamar Stop-Control con el PID de este runner.
    } $state
    Write-Host 'PASS: AST PowerShell, módulo, npm ci con reintentos y diagnóstico, DACL privada, JSON atómico e identidad de proceso.'
    if ($Integration) {
        # Hosted Windows has both setup-node and a preinstalled Node on PATH.
        $expectedNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $selectedNode = & $module { Get-NodePath }
        Assert-True ($selectedNode -is [string] -and $selectedNode -eq $expectedNode) 'Node debe resolverse a una sola ruta respetando la prioridad PATH.'
        $caddy = (Get-Command caddy -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $selectedCaddy = & $module { Get-CaddyPath }
        Assert-True ($selectedCaddy -is [string] -and $selectedCaddy -eq $caddy) 'Caddy debe resolverse a una sola ruta respetando la prioridad PATH.'
        $port = 3143; $httpsPort = 8543
        $configFile = Join-Path $state 'control.json'
        $config = & $module {
            param($State,$Caddy,$Port,$HttpsPort)
            $secretDir = Join-Path $State 'secrets'; New-Item -ItemType Directory -Path $secretDir | Out-Null; Set-PrivatePermissions $secretDir
            $access = Join-Path $secretDir 'access.scrypt'
            # Texto PÚBLICO de fixture; nunca reutilizar para un despliegue.
            $fixture = 'PUBLIC-SYNTHETIC-CI-PASSPHRASE-NOT-A-REAL-SECRET'
            $node = Get-NodePath
            $hash = $fixture | & $node --import tsx scripts/password.ts
            if ($LASTEXITCODE -ne 0) { throw 'No se generó el hash sintético.' }
            [IO.File]::WriteAllText($access, $hash.Trim(), [Text.UTF8Encoding]::new($false)); Set-PrivatePermissions $access
            $key = Join-Path $secretDir 'backup.key'; [IO.File]::WriteAllBytes($key,[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)); Set-PrivatePermissions $key
            $storage = (Join-Path $State 'caddy-storage').Replace('\','/'); $caddyfile = Join-Path $State 'Caddyfile'
            @"
{
    admin off
    skip_install_trust
    auto_https disable_redirects
    storage file_system {
        root "$storage"
    }
}
https://localhost:$HttpsPort {
    bind 127.0.0.1 ::1
    tls internal
    reverse_proxy 127.0.0.1:$Port {
        header_up -Forwarded
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-For {remote_host}
        flush_interval -1
    }
}
"@ | Set-Content -LiteralPath $caddyfile -Encoding utf8NoBOM
            return @{ schemaVersion = 1; mode = 'Local'; origin = "https://localhost:$HttpsPort"; internalPort = $Port; httpsPort = $HttpsPort; allowedOrigins = "https://localhost:$HttpsPort"; dataDir = Join-Path $State 'data'; passwordHashFile = $access; backupKeyFile = $key; caddyPath = $Caddy; caddySha256 = (Get-FileHash $Caddy -Algorithm SHA256).Hash; caddyfile = $caddyfile; caFile = Join-Path $State 'caddy-storage/pki/authorities/local/root.crt'; controllerName = 'FIXTURE CI SINTETICA'; privacyContact = 'ci@example.invalid'; dataCountry = 'CU'; exceptionReference = '' }
        } $state $caddy $port $httpsPort
        & $module { param($File,$Config) Write-PrivateJson $File $Config } $configFile $config
        Invoke-NexoControl -Action Start -StateDirectory $state -NoBuild -NoBrowser
        $status = @(Invoke-NexoControl -Action Status -StateDirectory $state)
        Assert-True ($status.Count -eq 2 -and @($status | Where-Object PropioYActivo).Count -eq 2) 'Web/backend/proxy no pertenecen al panel.'
        $probe = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5 -NoProxy
        Assert-True ((($probe.Content | ConvertFrom-Json).ok) -eq $true) 'No está saludable.'
        Invoke-NexoControl -Action Backup -StateDirectory $state
        Assert-True (@(Get-ChildItem (Join-Path $state 'data/backups') -Filter '*.nxb').Count -eq 1) 'Falta respaldo cifrado.'
        Invoke-NexoControl -Action Restart -StateDirectory $state -NoBuild -NoBrowser
        Invoke-NexoControl -Action Stop -StateDirectory $state
        Assert-True (!(Test-Path (Join-Path $state 'processes.json'))) 'El manifiesto no se limpió.'
        Write-Host 'PASS: build existente + backend + Caddy local + HTTPS con CA verificada + backup + restart + stop.'
    }
} finally {
    if (Test-Path (Join-Path $state 'processes.json')) { Invoke-NexoControl -Action Stop -StateDirectory $state }
    Remove-Item -LiteralPath $state -Recurse -Force
}
