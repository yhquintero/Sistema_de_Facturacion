#Requires -Version 7.4
<#
.SYNOPSIS
Inicia y administra Nexo: web compilada + API + tiempo real + proxy HTTPS.
.DESCRIPTION
No omite ExecutionPolicy, no descarga ejecutables ni abre puertos o instala CA sin una acción explícita.
La primera ejecución pide una frase de acceso sin eco; no se pasa por argumentos ni se guarda en claro.
#>
[CmdletBinding()]
param(
    [ValidateSet('Start','Menu','Initialize','Stop','Restart','Status','Backup','ExportService','TrustLocalCA','OpenLanFirewall','RemoveLanFirewall','ApproveCaddy')]
    [string] $Action = 'Start',
    [ValidateSet('Local','LAN','Public')] [string] $Mode = 'Local',
    [string] $Domain,
    [string] $LanAddress,
    [ValidateRange(1024,65535)] [int] $HttpsPort = 8443,
    [ValidateRange(1024,65535)] [int] $InternalPort = 3000,
    [string] $StateDirectory,
    [string] $ExportPath,
    [switch] $InstallDependencies,
    [switch] $NoBrowser,
    [switch] $NoBuild
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Nexo.Control.psm1') -Force
Invoke-NexoControl @PSBoundParameters
