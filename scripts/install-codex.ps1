param([switch]$SkipBrowser)

$ErrorActionPreference = 'Stop'
$roadmapRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}

Get-Command codex, node, npm -ErrorAction Stop | Out-Null
$nodeMajor = [int]((& node --version) -replace '^v(\d+).*$', '$1')
if ($nodeMajor -lt 22) { throw 'Node.js 22+ is required.' }

Invoke-Checked 'codex' @('plugin', 'marketplace', 'add', $roadmapRoot)
$installJson = & codex plugin add roadmap-generator@roadmap-tools --json
if ($LASTEXITCODE -ne 0) { throw 'Codex plugin installation failed.' }
$installation = ($installJson -join "`n") | ConvertFrom-Json
if (-not $installation.installedPath) { throw 'Codex did not return installedPath. Update Codex CLI and retry.' }
$installedRoot = (Resolve-Path -LiteralPath $installation.installedPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $installedRoot '.codex-plugin/plugin.json'))) {
    throw "Plugin manifest missing in $installedRoot"
}

Push-Location -LiteralPath $installedRoot
try {
    Invoke-Checked 'npm' @('ci', '--omit=dev', '--no-audit', '--no-fund')
    Invoke-Checked 'node' @((Join-Path $PSScriptRoot 'check-codex-install.js'), $installedRoot)
    if (-not $SkipBrowser) {
        & node (Join-Path $PSScriptRoot 'check-codex-install.js') $installedRoot --browser
        if ($LASTEXITCODE -ne 0) {
            Invoke-Checked 'npx' @('--no-install', 'playwright', 'install', 'chromium')
            Invoke-Checked 'node' @((Join-Path $PSScriptRoot 'check-codex-install.js'), $installedRoot, '--browser')
        }
    }
} finally {
    Pop-Location
}

Write-Host "Installed and verified: $installedRoot"
Write-Host 'Restart Codex and open a new chat. The roadmap skill and MCP tools are supplied by the plugin.'
Write-Host 'If a separate roadmap MCP entry was configured previously, remove it with: codex mcp remove roadmap'
