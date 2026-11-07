#Requires -Version 7.4
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Repository = Split-Path $PSScriptRoot -Parent

function Set-PrivatePermissions([string] $Path) {
    if ($IsWindows) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = Get-Acl -LiteralPath $Path
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
        $inherit = if (Test-Path -LiteralPath $Path -PathType Container) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
        foreach ($sid in @($identity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $Path -AclObject $acl
    } else {
        $mode = if (Test-Path -LiteralPath $Path -PathType Container) { 448 } else { 384 }
        [IO.File]::SetUnixFileMode($Path, [IO.UnixFileMode] $mode)
    }
}
function Write-PrivateJson([string] $Path, $Value) {
    $temporary = $Path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    try { [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $Value -Depth 8), [Text.UTF8Encoding]::new($false)); Set-PrivatePermissions $temporary; [IO.File]::Move($temporary, $Path, $true) } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}
function Get-NodePath {
    $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $version = (& $node --version).TrimStart('v')
    if ([version]$version -lt [version]'22.13.0') { throw 'Instala Node.js >=22.13 desde una fuente oficial.' }
    return $node
}
function Get-CaddyPath {
    $command = Get-Command caddy -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) {
        throw @'
Caddy no está instalado o no está en PATH.
Instálalo consultando solo la fuente winget (evita el error msstore 0x8a15003b):
  winget install --id CaddyServer.Caddy --exact --source winget
Si la instalación falla, no continúes con el panel. Si termina correctamente, cierra la terminal, abre una nueva y comprueba:
  caddy version
Si winget indica que ya está instalado pero no se reconoce, revisa su carpeta y el PATH del usuario.
Alternativa: instala el binario oficial y añade su carpeta a PATH. Consulta docs/OPERACION-SEGURA.md.
El panel no descarga ejecutables ni desactiva HTTPS automáticamente.
'@
    }
    return $command.Source
}
function Invoke-Node([string[]] $Arguments, [hashtable] $Environment = @{}) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Get-NodePath
    $start.WorkingDirectory = $script:Repository
    $start.UseShellExecute = $false
    foreach ($arg in $Arguments) { $start.ArgumentList.Add($arg) }
    foreach ($key in $Environment.Keys) { $start.Environment[$key] = [string]$Environment[$key] }
    $process = [Diagnostics.Process]::Start($start)
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "La operación Node terminó con código $($process.ExitCode)." }
}
function Get-Config {
    if (!(Test-Path -LiteralPath $script:ConfigFile)) { return $null }
    $config = Get-Content -LiteralPath $script:ConfigFile -Raw | ConvertFrom-Json
    if ($config.schemaVersion -ne 1) { throw 'Versión de configuración no admitida. Conserva los datos y revisa la migración.' }
    if ($config.origin -notmatch '^https://') { throw 'El panel solo admite orígenes HTTPS.' }
    return $config
}
function Get-NodeEnvironment($Config) {
    return @{
        NODE_ENV = 'production'; HOST = '127.0.0.1'; PORT = [string]$Config.internalPort
        DATA_DIR = [string]$Config.dataDir; SEED_DEMO = 'false'; ALLOW_PUBLIC_DEMO = 'false'
        ADMIN_USERNAME = 'admin'; APP_PASSWORD = ''; APP_PASSWORD_FILE = ''; APP_PASSWORD_HASH_FILE = [string]$Config.passwordHashFile
        BACKUP_KEY_FILE = [string]$Config.backupKeyFile; TLS_MODE = 'proxy'; PUBLIC_ORIGIN = [string]$Config.origin
        ALLOWED_ORIGINS = [string]$Config.allowedOrigins; TRUST_PROXY = '127.0.0.1/32,::1/128'
        FRAME_ANCESTORS = "'none'"; ALLOW_INSECURE_LOCALHOST = 'false'
        DATA_LOCATION_COUNTRY = [string]$Config.dataCountry; DATA_LOCATION_LEGAL_EXCEPTION_REFERENCE = [string]$Config.exceptionReference; DATA_CONTROLLER_NAME = [string]$Config.controllerName; PRIVACY_CONTACT = [string]$Config.privacyContact
    }
}
function Read-PasswordHash {
    $secret = Read-Host 'Frase de acceso NUEVA (14 o más caracteres)' -AsSecureString
    $confirmation = Read-Host 'Repite la frase' -AsSecureString
    $first = [IntPtr]::Zero; $second = [IntPtr]::Zero
    try {
        $first = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $second = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($first)
        $again = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($second)
        if ($plain -cne $again -or $plain.Length -lt 14 -or $plain.Length -gt 1024) { throw 'Las frases no coinciden o no tienen de 14 a 1024 caracteres.' }
        $start = [Diagnostics.ProcessStartInfo]::new()
        $start.FileName = Get-NodePath; $start.WorkingDirectory = $script:Repository; $start.UseShellExecute = $false
        $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true
        foreach ($arg in @('--import','tsx','scripts/password.ts')) { $start.ArgumentList.Add($arg) }
        $process = [Diagnostics.Process]::Start($start)
        $process.StandardInput.Write($plain); $process.StandardInput.Close()
        $result = $process.StandardOutput.ReadToEnd().Trim()
        if (!$process.WaitForExit(15000)) { $process.Kill(); throw 'Tiempo de espera al generar el hash.' }
        if ($process.ExitCode -ne 0 -or !$result.StartsWith('scrypt$32768$8$1$')) { throw 'No se pudo generar el hash de acceso.' }
        return $result
    } finally {
        $plain = $null; $again = $null
        if ($first -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($first) }
        if ($second -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($second) }
        $secret.Dispose(); $confirmation.Dispose()
    }
}
function Initialize-Control($Mode, $Domain, $LanAddress, $HttpsPort, $InternalPort) {
    if (Get-Config) { throw 'Ya existe configuración. No se sobrescriben datos ni claves. Usa Start o edita una copia revisada de control.json.' }
    if ($Mode -eq 'Public') { $HttpsPort = 443 }
    if ($HttpsPort -eq $InternalPort) { throw 'Los puertos HTTPS e interno deben ser distintos.' }
    $caddy = Get-CaddyPath
    if ($Mode -eq 'Public') {
        if (!$Domain) { $Domain = Read-Host 'Dominio público propio (solo nombre DNS)' }
        if ($Domain -notmatch '^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$' -or $Domain -match '\.(local|localhost|test|invalid)$') { throw 'Indica un dominio DNS propio válido, sin ruta ni protocolo.' }
        Write-Warning 'Cuba: confirma hospedaje nacional, autorización de publicación, DNS, firewall y normativa. No se crea un túnel extranjero ni se modifica el router.'
        if ((Read-Host 'Escribe PUBLICAR para confirmar esta exposición') -cne 'PUBLICAR') { throw 'Publicación cancelada.' }
        $origin = "https://$($Domain.ToLowerInvariant())"; $sites = $Domain.ToLowerInvariant()
    } elseif ($Mode -eq 'LAN') {
        if (!$LanAddress) { $LanAddress = Read-Host 'IP privada fija del equipo en la red Wi-Fi (ejemplo 192.168.1.20)' }
        $address = [Net.IPAddress]::Parse($LanAddress); $bytes = $address.GetAddressBytes()
        if ($bytes.Length -ne 4 -or !(($bytes[0] -eq 10) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31))) { throw 'LAN requiere una dirección IPv4 privada 10/8, 172.16/12 o 192.168/16.' }
        $origin = "https://${LanAddress}:$HttpsPort"; $sites = "https://${LanAddress}:$HttpsPort, https://localhost:$HttpsPort, https://127.0.0.1:$HttpsPort"
    } else { $origin = "https://localhost:$HttpsPort"; $sites = "https://localhost:$HttpsPort, https://127.0.0.1:$HttpsPort" }
    $dataCountry = Read-Host 'País físico del servidor y respaldos (CU solo si verificado; otro código o UNCONFIRMED)'
    if (!$dataCountry) { $dataCountry = 'UNCONFIRMED' }; $dataCountry = $dataCountry.ToUpperInvariant()
    $exceptionReference = ''
    if ($dataCountry -ne 'CU') { $exceptionReference = Read-Host 'Referencia de excepción jurídica revisada (vacío cancela: este panel es para datos reales)'; if (!$exceptionReference) { throw 'Residencia no confirmada. Usa solo datos ficticios en desarrollo hasta obtener revisión jurídica.' } }
    $controller = Read-Host 'Nombre público del responsable del tratamiento (Suministrador)'
    $privacyContact = Read-Host 'Correo de contacto para privacidad'
    if (!$controller -or $privacyContact -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Indica un responsable y un correo de contacto válido.' }
    $secrets = Join-Path $script:State 'secrets'; New-Item -ItemType Directory -Path $secrets -Force | Out-Null; Set-PrivatePermissions $secrets
    $passwordFile = Join-Path $secrets 'access.scrypt'; $backupKey = Join-Path $secrets 'backup.key'
    if ((Test-Path -LiteralPath $passwordFile) -or (Test-Path -LiteralPath $backupKey)) { throw 'Existen secretos de una inicialización previa o parcial. NO se reemplazan: conserva claves y copias y recupera control.json antes de continuar.' }
    [IO.File]::WriteAllText($passwordFile, (Read-PasswordHash), [Text.UTF8Encoding]::new($false)); Set-PrivatePermissions $passwordFile
    $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    [IO.File]::WriteAllBytes($backupKey, $random); [Array]::Clear($random); Set-PrivatePermissions $backupKey
    $data = Join-Path $script:State 'data'; New-Item -ItemType Directory -Path $data -Force | Out-Null; Set-PrivatePermissions $data
    $storage = (Join-Path $script:State 'caddy-storage').Replace('\','/'); $caddyfile = Join-Path $script:State 'Caddyfile'
    $lanOptions = if ($Mode -ne 'Public') { "    skip_install_trust`n    auto_https disable_redirects" } else { '' }
    $tls = if ($Mode -ne 'Public') { "tls internal {`n        protocols tls1.2 tls1.3`n    }" } else { "tls {`n        protocols tls1.2 tls1.3`n    }" }
    $bind = if ($Mode -eq 'Local') { 'bind 127.0.0.1 ::1' } elseif ($Mode -eq 'LAN') { "bind $LanAddress 127.0.0.1 ::1" } else { '' }
    @"
{
    admin off
$lanOptions
    storage file_system {
        root "$storage"
    }
}
$sites {
    $bind
    $tls
    request_body {
        max_size 4MB
    }
    reverse_proxy 127.0.0.1:$InternalPort {
        header_up -Forwarded
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-For {remote_host}
        flush_interval -1
    }
}
"@ | Set-Content -LiteralPath $caddyfile -Encoding utf8NoBOM
    $config = @{ schemaVersion = 1; mode = $Mode; origin = $origin; internalPort = $InternalPort; httpsPort = $HttpsPort; allowedOrigins = if ($Mode -ne 'Public') { "https://localhost:$HttpsPort,https://127.0.0.1:$HttpsPort,$origin" } else { $origin }; dataDir = $data; passwordHashFile = $passwordFile; backupKeyFile = $backupKey; caddyPath = $caddy; caddySha256 = (Get-FileHash -LiteralPath $caddy -Algorithm SHA256).Hash; caddyfile = $caddyfile; caFile = Join-Path $script:State 'caddy-storage/pki/authorities/local/root.crt'; controllerName = $controller; privacyContact = $privacyContact; dataCountry = $dataCountry; exceptionReference = $exceptionReference }
    Write-PrivateJson $script:ConfigFile $config
    Write-Warning 'Guarda una copia de backup.key en otro medio protegido. La contraseña no recupera los respaldos. Verifica también BitLocker y la política de conservación.'
    Write-Host 'Configuración creada sin datos de demostración. La ubicación configurada es una declaración del operador, no una geolocalización verificada.'
    return Get-Config
}
function Read-ProcessState {
    if (!(Test-Path -LiteralPath $script:ProcessFile)) { return @() }
    return @(Get-Content -LiteralPath $script:ProcessFile -Raw | ConvertFrom-Json)
}
function Get-OwnedProcess($Record) {
    $process = Get-Process -Id $Record.processId -ErrorAction SilentlyContinue
    if (!$process) { return $null }
    if ($process.StartTime.ToUniversalTime().Ticks -ne [long]$Record.startTicks -or [IO.Path]::GetFullPath($process.Path) -ne [IO.Path]::GetFullPath($Record.executable)) { return $null }
    return $process
}
function Stop-Control {
    foreach ($record in (Read-ProcessState | Sort-Object role)) {
        $process = Get-OwnedProcess $record
        if ($process) {
            if ($record.role -eq 'backend' -and $record.PSObject.Properties.Name -contains 'shutdownFile' -and $record.shutdownFile) {
                $signal = [IO.Path]::GetFullPath($record.shutdownFile)
                if (!$signal.StartsWith($script:State + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta de apagado ajena al estado privado. No se escribe ni detiene un proceso no comprobado.' }
                [IO.File]::WriteAllText($signal, 'shutdown', [Text.UTF8Encoding]::new($false))
                Wait-Process -Id $process.Id -Timeout 15 -ErrorAction SilentlyContinue
            }
            $remaining = Get-OwnedProcess $record
            if ($remaining) { if ($record.role -eq 'backend') { Write-Warning 'Se agotó la espera de apagado ordenado. Se fuerza solo el proceso comprobado; verifica integridad y operaciones interrumpidas.' }; Stop-Process -Id $remaining.Id -ErrorAction Stop }
            Write-Host "Detenido: $($record.role) ($($record.processId))." }
        else { Write-Host "No se detiene PID ajeno o ya finalizado: $($record.role)." }
    }
    Remove-Item -LiteralPath $script:ProcessFile -Force -ErrorAction SilentlyContinue
}
function Start-Managed([string] $Role, [string] $Executable, [string[]] $Arguments, [hashtable] $Environment) {
    # Start-Process joins ArgumentList on Windows: quote every nonsecret argument explicitly.
    $quoted = @($Arguments | ForEach-Object { if ($_ -match '["\r\n]') { throw 'Argumento de proceso no admitido.' }; '"' + $_ + '"' }) -join ' '
    $logs = Join-Path $script:State 'logs'; New-Item -ItemType Directory -Path $logs -Force | Out-Null; Set-PrivatePermissions $logs
    $process = Start-Process -FilePath $Executable -ArgumentList $quoted -WorkingDirectory $script:Repository -Environment $Environment -RedirectStandardOutput (Join-Path $logs "$Role.stdout.log") -RedirectStandardError (Join-Path $logs "$Role.stderr.log") -PassThru
    $process.Refresh()
    $record = @{ role = $Role; processId = $process.Id; startTicks = $process.StartTime.ToUniversalTime().Ticks; executable = [IO.Path]::GetFullPath($Executable); shutdownFile = if ($Environment.ContainsKey('CONTROL_SHUTDOWN_FILE')) { $Environment.CONTROL_SHUTDOWN_FILE } else { '' } }
    $records = @(Read-ProcessState) + @($record); Write-PrivateJson $script:ProcessFile $records
    return $record
}
function Start-Control($Config, [switch] $NoBrowser, [switch] $NoBuild) {
    $records = @(Read-ProcessState)
    if ($records.Count -eq 2 -and @($records | Where-Object { Get-OwnedProcess $_ }).Count -eq 2) { Write-Host "Ya está activo: $($Config.origin)"; return }
    if ($records.Count) { Stop-Control }
    if ((Get-FileHash -LiteralPath $Config.caddyPath -Algorithm SHA256).Hash -cne $Config.caddySha256) { throw 'Caddy ha cambiado. Verifica su origen y utiliza ApproveCaddy antes de iniciar.' }
    if (!$NoBuild) {
        Push-Location $script:Repository
        try { $npm = if ($IsWindows) { 'npm.cmd' } else { 'npm' }; & $npm run build; if ($LASTEXITCODE -ne 0) { throw 'Compilación fallida. No se inicia una versión incompleta.' } } finally { Pop-Location }
    } elseif (!(Test-Path (Join-Path $script:Repository 'dist/index.html'))) { throw 'NoBuild requiere una compilación existente y revisada.' }
    & $Config.caddyPath validate --config $Config.caddyfile --adapter caddyfile
    if ($LASTEXITCODE -ne 0) { throw 'Configuración Caddy no válida. No se inicia.' }
    try {
        $environment = Get-NodeEnvironment $Config; $environment.CONTROL_INSTANCE_ID = [guid]::NewGuid().ToString('N'); $environment.CONTROL_SHUTDOWN_FILE = Join-Path $script:State ('node-stop-' + [guid]::NewGuid().ToString('N') + '.signal')
        $nodeRecord = Start-Managed 'backend' (Get-NodePath) @('--import','tsx','server/index.ts','--production') $environment
        $ready = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            if (!(Get-OwnedProcess $nodeRecord)) { throw 'El backend terminó. Consulta logs/backend.stderr.log.' }
            try { $health = Invoke-WebRequest -Uri "http://127.0.0.1:$($Config.internalPort)/api/health" -Headers @{ 'X-Nexo-Control-Instance' = $environment.CONTROL_INSTANCE_ID } -TimeoutSec 2 -NoProxy; if ($health.Headers['X-Nexo-Instance'] -eq $environment.CONTROL_INSTANCE_ID -and ($health.Content | ConvertFrom-Json).ok) { $ready = $true; break } } catch { }
            Start-Sleep -Milliseconds 500
        }
        if (!$ready) { throw 'El backend no alcanzó el estado saludable.' }
        $caddyRecord = Start-Managed 'https' $Config.caddyPath @('run','--config',$Config.caddyfile,'--adapter','caddyfile') @{}
        $verified = $false
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            if (!(Get-OwnedProcess $caddyRecord)) { throw 'El proxy HTTPS terminó. Consulta logs/https.stderr.log.' }
            if ($Config.mode -ne 'Public' -and !(Test-Path -LiteralPath $Config.caFile)) { Start-Sleep -Seconds 1; continue }
            $probe = @('--import','tsx','scripts/probe-https.ts','--url',$Config.origin)
            if ($Config.mode -ne 'Public') { $probe += @('--ca',$Config.caFile) }
            try { Invoke-Node $probe; $verified = $true; break } catch { Start-Sleep -Seconds 2 }
        }
        if (!$verified) { throw 'No se pudo verificar HTTPS. Revisa certificado, DNS, puertos y cadena. No se desactiva su validación.' }
        if ($Config.mode -ne 'Public') {
            $share = Join-Path $script:State 'share'; New-Item -ItemType Directory -Path $share -Force | Out-Null; Set-PrivatePermissions $share
            Copy-Item -LiteralPath $Config.caFile -Destination (Join-Path $share 'Nexo-CA-PUBLICA.crt') -Force
            Write-Host "CA pública para confiar explícitamente en PC/móvil: $(Join-Path $share 'Nexo-CA-PUBLICA.crt')"
            Write-Host "SHA-256: $((Get-FileHash -LiteralPath $Config.caFile -Algorithm SHA256).Hash)"
            Write-Warning 'El navegador y cada móvil deben confiar por separado en esta CA, tras comprobar la huella. No ignores advertencias TLS. No compartas caddy-storage ni claves privadas.'
        }
        Write-Host "WEB + SERVIDOR + TIEMPO REAL: $($Config.origin)"
        if (!$NoBrowser) { Start-Process $Config.origin | Out-Null }
    } catch { Stop-Control; throw }
}
function Set-LanFirewall($Config, [switch] $Remove) {
    if (!$IsWindows) { throw 'La gestión de Windows Firewall solo está disponible en Windows.' }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent(); $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Esta acción explícita requiere PowerShell elevado. No ejecutes todo el sistema como administrador.' }
    $rule = "Nexo-LAN-HTTPS-$($Config.httpsPort)"
    if ($Remove) { Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue | Remove-NetFirewallRule; return }
    if ($Config.mode -ne 'LAN') { throw 'Solo se abre una regla privada y de subred local en modo LAN. Public necesita revisión de infraestructura.' }
    if (!(Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name $rule -DisplayName $rule -Direction Inbound -Action Allow -Profile Private -RemoteAddress LocalSubnet -Protocol TCP -LocalPort $Config.httpsPort -Program $Config.caddyPath | Out-Null }
    Write-Host 'Regla creada solo en perfil privado/subred local. El puerto del backend no se abre.'
}
# --- Dependencias npm -------------------------------------------------------
# npm ci se ejecuta con reintentos porque una conexión inestable (ECONNRESET, tiempo agotado)
# no debe obligar a empezar de cero: cada paquete descargado queda en la caché de npm, verificado
# contra la huella «integrity» del package-lock.json, y --prefer-offline lo reutiliza en el siguiente intento.
$script:NpmCiArguments = @('ci','--no-audit','--no-fund','--prefer-offline','--fetch-retries=5','--fetch-retry-factor=2','--fetch-retry-mintimeout=15000','--fetch-retry-maxtimeout=120000','--fetch-timeout=600000')
function Invoke-NpmProcess([string[]] $Arguments) {
    $name = if ($IsWindows) { 'npm.cmd' } else { 'npm' }
    $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) { throw 'npm no está disponible en PATH. Reinstala Node.js desde nodejs.org (incluye npm), abre una terminal nueva y comprueba: npm --version' }
    $npm = $command.Source; $code = 1
    $output = [Collections.Generic.List[string]]::new(); $deprecated = 0
    $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    try {
        & $npm @Arguments 2>&1 | ForEach-Object {
            $line = "$_"; $output.Add($line)
            # Los avisos «deprecated» vienen de dependencias indirectas (exceljs, pdfkit): se resumen, no se ocultan.
            if ($line -match '^npm warn deprecated ') { $deprecated++ } else { Write-Host $line }
        }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($deprecated) { Write-Host "($deprecated avisos «deprecated» de dependencias indirectas; no impiden la instalación. Detalle en docs/OPERACION-SEGURA.md.)" }
    return [PSCustomObject]@{ ExitCode = $code; Output = ($output -join "`n") }
}
$script:NpmRunner = { param([string[]] $Arguments) Invoke-NpmProcess $Arguments }
function Get-LockfileHash { return (Get-FileHash -LiteralPath (Join-Path $script:Repository 'package-lock.json') -Algorithm SHA256).Hash }
function Get-DependencyMarker { return Join-Path $script:Repository 'node_modules/.nexo-lockfile.sha256' }
function Test-DependenciesCurrent {
    $marker = Get-DependencyMarker
    if (!(Test-Path -LiteralPath (Join-Path $script:Repository 'node_modules/tsx/package.json')) -or !(Test-Path -LiteralPath $marker)) { return $false }
    return ((Get-Content -LiteralPath $marker -Raw).Trim() -ceq (Get-LockfileHash))
}
function Get-NpmFailureKind([string] $Output) {
    if ($Output -match 'EUSAGE|npm ci.{0,40}(in sync|sincron)|package-lock\.json.{0,80}(missing|not in sync|out of sync)|Invalid: lock file') { return 'Lockfile' }
    if ($Output -match 'SELF_SIGNED_CERT|UNABLE_TO_(GET_ISSUER|VERIFY_LEAF)|CERT_[A-Z_]+|ERR_TLS_CERT') { return 'Certificate' }
    if ($Output -match 'E407|Proxy Authentication Required') { return 'Proxy' }
    if ($Output -match 'ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|ERR_SOCKET_TIMEOUT|ECONNREFUSED|ECONNABORTED|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ENETDOWN|EPIPE|socket hang up|network (read|timeout|request)|EINTEGRITY|code E5\d\d\b') { return 'Network' }
    if ($Output -match '\b(EPERM|EBUSY|ENOTEMPTY|EACCES)\b') { return 'Locked' }
    return 'Other'
}
function Get-NpmFailureMessage([string] $Kind, [int] $Attempts) {
    $retry = 'pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -InstallDependencies'
    switch ($Kind) {
        'Network' { return @"
No se pudieron descargar las dependencias: la conexión con el registro de npm se cortó o tardó demasiado ($Attempts intentos).
Es un problema de red, no del proyecto. Lo ya descargado quedó en la caché de npm, verificado, y no se vuelve a descargar:
  1. Vuelve a ejecutar el mismo comando; continuará desde lo que ya tienes:
       $retry
  2. Comprueba el acceso al registro:   npm ping
  3. Si tu red usa un proxy:            npm config set proxy http://HOST:PUERTO
                                        npm config set https-proxy http://HOST:PUERTO
  4. Si el registro oficial no responde bien desde tu red, usa un espejo solo para esta instalación:
       $retry -NpmRegistry https://registry.npmmirror.com/
     npm comprueba cada paquete con la huella (integrity) de package-lock.json: un espejo no puede cambiar el código.
  5. Sin conexión en este equipo: instala en otro PC con Internet y copia su caché de npm (ruta: npm config get cache)
     a la misma ruta de este equipo. Después ejecuta el comando del paso 1.
El registro completo de npm está en la ruta «A complete log of this run…» que aparece arriba.
"@ }
        'Locked' { return @"
npm no pudo escribir en node_modules porque otro programa tiene archivos abiertos (EPERM/EBUSY).
Cierra el editor o terminales que usen el proyecto y detén Nexo, luego vuelve a ejecutar:
  pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -Action Stop
  $retry
Si persiste, excluye la carpeta del proyecto del análisis en tiempo real del antivirus o de la sincronización de OneDrive.
"@ }
        'Certificate' { return @"
La conexión con el registro de npm presenta un certificado no reconocido (proxy o antivirus que inspecciona HTTPS).
No desactives la verificación (strict-ssl=false). Pide la CA de tu red e indícala a npm:
  npm config set cafile C:\ruta\ca-de-tu-red.pem
Después vuelve a ejecutar:  $retry
"@ }
        'Proxy' { return @"
El proxy de tu red exige autenticación (E407). Configúralo para npm y vuelve a ejecutar:
  npm config set proxy http://USUARIO@HOST:PUERTO
  npm config set https-proxy http://USUARIO@HOST:PUERTO
  $retry
"@ }
        'Lockfile' { return @"
package.json y package-lock.json no coinciden, así que npm ci se niega a instalar (es lo correcto).
Actualiza el proyecto completo (git pull) para recibir ambos archivos juntos y vuelve a ejecutar:
  $retry
No uses npm install --force ni borres package-lock.json.
"@ }
        default { return "npm ci no pudo verificar e instalar el lockfile. Revisa el mensaje de npm de arriba y vuelve a ejecutar: $retry" }
    }
}
function Install-Dependencies([string] $Registry, [int] $MaxAttempts = 4, [int[]] $DelaySeconds = @(10, 30, 60)) {
    $arguments = @($script:NpmCiArguments)
    if ($Registry) {
        $uri = $null
        if (![Uri]::TryCreate($Registry, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query) { throw 'NpmRegistry debe ser una dirección https:// sin usuario, contraseña ni parámetros.' }
        $arguments += "--registry=$($uri.AbsoluteUri)"
        Write-Host "Registro npm para esta instalación: $($uri.AbsoluteUri) (cada paquete se verifica con la huella del package-lock.json)."
    }
    if (Test-DependenciesCurrent) {
        Write-Host 'Dependencias ya instaladas y al día con package-lock.json; no se descarga nada. (Para reinstalar, borra la carpeta node_modules.)'
        return
    }
    $kind = 'Other'
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        Write-Host "Instalando dependencias con npm ci (intento $attempt de $MaxAttempts). Puede tardar varios minutos con una conexión lenta…"
        $result = & $script:NpmRunner $arguments
        if ($result.ExitCode -eq 0) {
            [IO.File]::WriteAllText((Get-DependencyMarker), (Get-LockfileHash), [Text.UTF8Encoding]::new($false))
            Write-Host 'Dependencias instaladas y verificadas.'
            return
        }
        $kind = Get-NpmFailureKind $result.Output
        if ($kind -notin @('Network','Locked') -or $attempt -eq $MaxAttempts) { break }
        $wait = $DelaySeconds[[Math]::Min($attempt - 1, $DelaySeconds.Count - 1)]
        $reason = if ($kind -eq 'Network') { 'La conexión con el registro de npm se cortó.' } else { 'Hay archivos de node_modules bloqueados por otro programa.' }
        Write-Host "$reason Reintento en $wait s; lo ya descargado se conserva en la caché de npm." -ForegroundColor Yellow
        if ($wait -gt 0) { Start-Sleep -Seconds $wait }
    }
    throw (Get-NpmFailureMessage $kind $attempt)
}

function Invoke-NexoControl {
    [CmdletBinding()]
    param([string]$Action = 'Start',[string]$Mode = 'Local',[string]$Domain,[string]$LanAddress,[int]$HttpsPort = 8443,[int]$InternalPort = 3000,[string]$StateDirectory,[string]$ExportPath,[switch]$InstallDependencies,[string]$NpmRegistry,[switch]$NoBrowser,[switch]$NoBuild)
    if ($NpmRegistry -and !$InstallDependencies) { throw 'NpmRegistry solo se usa junto con -InstallDependencies.' }
    $script:State = if ($StateDirectory) { [IO.Path]::GetFullPath($StateDirectory) } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'NexoFacturacion' }
    if ($script:State.Contains('"') -or $script:State -match '[\r\n]') { throw 'Directorio de estado no admitido.' }
    New-Item -ItemType Directory -Path $script:State -Force | Out-Null; Set-PrivatePermissions $script:State
    $lock = $null
    try {
    if ($Action -ne 'Status') { try { $lock = [IO.File]::Open((Join-Path $script:State 'control.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch { throw 'Otro panel tiene una operación activa. Termina esa operación o cierra su menú antes de continuar.' } }
    $script:ConfigFile = Join-Path $script:State 'control.json'; $script:ProcessFile = Join-Path $script:State 'processes.json'
    $config = Get-Config
    # Fallar antes de npm ci y antes de pedir secretos si falta el proxy en el primer inicio.
    if ($Action -eq 'Initialize' -or (!$config -and $Action -in @('Start','Menu'))) { Get-CaddyPath | Out-Null }
    $nodeActions = @('Start','Menu','Initialize','Restart','Backup','ExportService')
    if ($Action -in $nodeActions -or $InstallDependencies) { Get-NodePath | Out-Null }
    if ($InstallDependencies) {
        Push-Location $script:Repository
        try { Install-Dependencies -Registry $NpmRegistry } finally { Pop-Location }
    }
    if ($Action -in $nodeActions -and !(Test-Path (Join-Path $script:Repository 'node_modules/tsx/package.json'))) { throw @'
Faltan las dependencias del proyecto (node_modules), o la última instalación no terminó.
Instálalas primero (se usa npm ci con el package-lock.json del proyecto):
  pwsh -NoProfile -File .\control\Panel-Sistema.ps1 -InstallDependencies
Si la descarga falla por la red, el mensaje de ese comando explica cómo reintentar, usar un proxy o un registro espejo.
'@ }
    if ($Action -eq 'ExportService') {
        $arguments = @('--import','tsx','scripts/package-service.ts'); if ($ExportPath) { $arguments += @('--output',[IO.Path]::GetFullPath($ExportPath)) }; Invoke-Node $arguments; return
    }
    if ($Action -eq 'Initialize' -or (!$config -and $Action -in @('Start','Menu'))) { $config = Initialize-Control $Mode $Domain $LanAddress $HttpsPort $InternalPort }
    if (!$config -and $Action -ne 'Stop') { throw 'Primero configura el panel con Initialize o Start.' }
    switch ($Action) {
        'Initialize' { Write-Host 'Listo. Ejecuta de nuevo sin argumentos para iniciar todo.' }
        'Start' { Start-Control $config -NoBrowser:$NoBrowser -NoBuild:$NoBuild }
        'Stop' { Stop-Control }
        'Restart' { Stop-Control; Start-Control $config -NoBrowser:$NoBrowser -NoBuild:$NoBuild }
        'Status' { foreach ($record in (Read-ProcessState)) { [PSCustomObject]@{ Servicio = $record.role; PID = $record.processId; PropioYActivo = [bool](Get-OwnedProcess $record); Origen = $config.origin } } }
        'Backup' { Invoke-Node @('--import','tsx','scripts/backup.ts') (Get-NodeEnvironment $config) }
        'TrustLocalCA' {
            if (!$IsWindows -or $config.mode -eq 'Public') { throw 'Esta acción es para la CA local en el almacén CurrentUser de Windows.' }
            Write-Host "Huella SHA-256: $((Get-FileHash -LiteralPath $config.caFile -Algorithm SHA256).Hash)"
            if ((Read-Host 'Escribe CONFIAR tras verificar esta CA propia') -cne 'CONFIAR') { throw 'Confianza cancelada.' }
            Import-Certificate -FilePath $config.caFile -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
        }
        'OpenLanFirewall' { Set-LanFirewall $config }
        'RemoveLanFirewall' { Set-LanFirewall $config -Remove }
        'ApproveCaddy' { $hash = (Get-FileHash -LiteralPath $config.caddyPath -Algorithm SHA256).Hash; Write-Host "Nuevo SHA-256 Caddy: $hash"; if ((Read-Host 'Escribe VERIFICADO tras contrastar origen y checksum oficial') -cne 'VERIFICADO') { throw 'Cambio no aprobado.' }; $config.caddySha256 = $hash; Write-PrivateJson $script:ConfigFile $config }
        'Menu' {
            Start-Control $config -NoBrowser:$NoBrowser -NoBuild:$NoBuild
            do {
                Write-Host "`n[1] Estado  [2] Copia cifrada  [3] Exportar servicio  [4] Detener  [5] Salir (mantener servicios)"
                $choice = Read-Host 'Acción'
                switch ($choice) {
                    '1' { foreach ($record in (Read-ProcessState)) { Write-Host "$($record.role): $([bool](Get-OwnedProcess $record))" } }
                    '2' { Invoke-Node @('--import','tsx','scripts/backup.ts') (Get-NodeEnvironment $config) }
                    '3' { Invoke-Node @('--import','tsx','scripts/package-service.ts') }
                    '4' { Stop-Control }
                }
            } while ($choice -ne '5')
        }
    }
    } finally { if ($null -ne $lock) { $lock.Dispose() } }
}
Export-ModuleMember -Function Invoke-NexoControl
