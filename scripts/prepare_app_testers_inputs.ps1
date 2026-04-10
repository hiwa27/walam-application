param(
    [string]$IpaPath,
    [string]$ProvisionPath,
    [string]$P12Path
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $projectRoot "ios_signing"

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
}

function Copy-IfProvided {
    param(
        [string]$Source,
        [string]$TargetName
    )

    if ([string]::IsNullOrWhiteSpace($Source)) {
        return
    }

    if (-not (Test-Path $Source)) {
        throw "File not found: $Source"
    }

    $targetPath = Join-Path $targetDir $TargetName
    Copy-Item -LiteralPath $Source -Destination $targetPath -Force
    Write-Host "Copied -> $targetPath"
}

Copy-IfProvided -Source $IpaPath -TargetName "walam_app_unsigned.ipa"
Copy-IfProvided -Source $ProvisionPath -TargetName "walam_app.mobileprovision"
Copy-IfProvided -Source $P12Path -TargetName "walam_app.p12"

$ipaFinal = Join-Path $targetDir "walam_app_unsigned.ipa"
$provFinal = Join-Path $targetDir "walam_app.mobileprovision"
$p12Final = Join-Path $targetDir "walam_app.p12"

Write-Host ""
Write-Host "Expected files for AppTesters IPA Signer:"
Write-Host "IPA            : $ipaFinal"
Write-Host "MobileProvision: $provFinal"
Write-Host "P12            : $p12Final"
Write-Host ""

if ((Test-Path $ipaFinal) -and (Test-Path $provFinal) -and (Test-Path $p12Final)) {
    Write-Host "Status: Ready for signing."
    exit 0
}

Write-Host "Status: Missing one or more files."
if (-not (Test-Path $ipaFinal)) { Write-Host "- Missing IPA" }
if (-not (Test-Path $provFinal)) { Write-Host "- Missing MobileProvision" }
if (-not (Test-Path $p12Final)) { Write-Host "- Missing P12" }
exit 1
