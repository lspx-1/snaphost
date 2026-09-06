# ==============================================================================
# SnapHost CLI Deployment Script (PowerShell for Windows)
# ==============================================================================
param (
    [Parameter(Position=0)]
    [string]$Path = ".",
    [string]$Slug = "",
    [string]$Ttl = "24h",
    [string]$Type = "auto",
    [string]$Password = "",
    [string]$Token = $env:DEPLOY_TOKEN
)

$Server = "{{SERVER_URL}}"

if (-not $Token) {
    $Token = Read-Host "Bitte DEPLOY_TOKEN / API-Key eingeben"
}

if (-not (Test-Path $Path)) {
    Write-Error "Pfad '$Path' existiert nicht."
    exit 1
}

$isHtml = (Test-Path -PathType Leaf $Path) -and ($Path -match '\.html?$')

if ($isHtml) {
    $uploadFile = (Resolve-Path $Path).Path
    Write-Host "Bereite HTML-Datei vor: $uploadFile" -ForegroundColor Cyan
} else {
    $uploadFile = Join-Path $env:TEMP "deploy_$(Get-Random).zip"
    Write-Host "Erstelle Archiv von '$Path'..." -ForegroundColor Cyan
    Compress-Archive -Path (Join-Path $Path "*") -DestinationPath $uploadFile -Force
}

Write-Host "Lade zu $Server hoch..." -ForegroundColor Cyan

$form = @{
    file = Get-Item $uploadFile
    ttl = $Ttl
    type = $Type
}
if ($Slug) { $form['slug'] = $Slug }
if ($Password) { $form['password'] = $Password }

try {
    $headers = @{ "Authorization" = "Bearer $Token" }
    $res = Invoke-RestMethod -Uri "$Server/api/deploy" -Method Post -Form $form -Headers $headers
    Write-Host "Bereitstellung erfolgreich!" -ForegroundColor Green
    Write-Host "URL: $($res.url)" -ForegroundColor Cyan
} catch {
    Write-Error "Fehler beim Deployment: $_"
} finally {
    if (-not $isHtml -and (Test-Path $uploadFile)) { 
        Remove-Item $uploadFile -Force 
    }
}
