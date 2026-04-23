param(
  [ValidateSet("lan", "tunnel")]
  [string]$HostMode = "lan",
  [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$expoCli = Join-Path $projectRoot "node_modules\.bin\expo.cmd"

if (-not (Test-Path $expoCli)) {
  throw "expo.cmd를 찾을 수 없습니다. 먼저 npm install을 실행해 주세요."
}

$extraArgs = @()
if ($args.Count -gt 0) {
  $extraArgs = $args
}

if ($HostMode -eq "lan") {
  $activeConfig = Get-NetIPConfiguration |
    Where-Object {
      $_.IPv4DefaultGateway -ne $null -and
      $_.IPv4Address -ne $null -and
      $_.NetAdapter.Status -eq "Up"
    } |
    Select-Object -First 1

  if (-not $activeConfig -or -not $activeConfig.IPv4Address.IPAddress) {
    throw "활성화된 LAN IPv4 주소를 찾지 못했습니다."
  }

  $ipAddress = $activeConfig.IPv4Address.IPAddress
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $ipAddress
  $env:EXPO_PACKAGER_PROXY_URL = "http://$ipAddress`:$Port"

  Write-Host "Using LAN IP: $ipAddress"
  Write-Host "Using Expo proxy URL: $($env:EXPO_PACKAGER_PROXY_URL)"

  & $expoCli start --dev-client --host lan --port $Port @extraArgs
  exit $LASTEXITCODE
}

Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue

Write-Host "Using tunnel mode for Expo dev build"

& $expoCli start --dev-client --tunnel --port $Port @extraArgs
exit $LASTEXITCODE
