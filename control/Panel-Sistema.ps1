#Requires -Version 7.4
<#
.SYNOPSIS
Inicia y administra Nexo: web compilada + API + tiempo real + proxy HTTPS.
.DESCRIPTION
-InstallDependencies ejecuta npm ci con reintentos y reutiliza la caché de npm si la conexión se corta.
No omite ExecutionPolicy, no descarga ejecutables ni abre puertos o instala CA sin una acción explícita.
La primera ejecución pide una frase de acceso sin eco; no se pasa por argumentos ni se guarda en claro.
Nexo usa https://localhost:8450 por defecto y no inicia si su puerto está ocupado (NovaGest usa 8443).
-Action SetPort -HttpsPort N mueve una instalación existente sin tocar datos, cuentas ni copias.
-Action TrustLocalCA hace que Windows confíe en el certificado local; -Action ResetPassword da una contraseña temporal a admin.
#>
[CmdletBinding()]
param(
    [ValidateSet('Start','Menu','Initialize','Stop','Restart','Status','Backup','ExportService','TrustLocalCA','OpenLanFirewall','RemoveLanFirewall','ApproveCaddy','SetPort','ResetPassword')]
    [string] $Action = 'Start',
    [ValidateSet('Local','LAN','Public')] [string] $Mode = 'Local',
    [string] $Domain,
    [string] $LanAddress,
    # 8450 por defecto: NovaGest (inventario) usa 8443 y 8444 en el mismo PC. Cambiar después: -Action SetPort -HttpsPort N.
    [ValidateRange(1024,65535)] [int] $HttpsPort = 8450,
    [ValidateRange(1024,65535)] [int] $InternalPort = 3000,
    [string] $StateDirectory,
    [string] $ExportPath,
    [switch] $InstallDependencies,
    # Registro npm alternativo (https) solo para esta instalación; los paquetes se verifican con package-lock.json.
    [string] $NpmRegistry,
    # Con -Action ResetPassword: usuario al que se da una contraseña temporal (por defecto admin).
    [string] $User,
    [switch] $NoBrowser,
    [switch] $NoBuild
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Nexo.Control.psm1') -Force
Invoke-NexoControl @PSBoundParameters
