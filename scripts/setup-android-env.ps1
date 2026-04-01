# Thêm Android SDK vào PATH + ANDROID_HOME (chạy 1 lần, PowerShell "Run as Administrator" không bắt buộc)
# Sau khi chạy: ĐÓNG hết terminal, mở PowerShell mới, gõ: adb devices

$ErrorActionPreference = 'Stop'

$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$platformTools = Join-Path $sdkRoot 'platform-tools'
$emulatorDir = Join-Path $sdkRoot 'emulator'

if (-not (Test-Path (Join-Path $platformTools 'adb.exe'))) {
  Write-Host "KHONG TIM THAY adb tai: $platformTools" -ForegroundColor Red
  Write-Host "Cai Android SDK Platform-Tools trong Android Studio: SDK Manager -> SDK Tools."
  exit 1
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $userPath) { $userPath = '' }
$paths = @($userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

$toAdd = @($platformTools)
if (Test-Path (Join-Path $emulatorDir 'emulator.exe')) {
  $toAdd += $emulatorDir
}

foreach ($p in $toAdd) {
  $norm = $p.TrimEnd('\')
  if ($paths -notcontains $norm) {
    $paths += $norm
  }
}

$newPath = ($paths -join ';')
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdkRoot, 'User')

Write-Host "Da cap nhat bien moi truong User:" -ForegroundColor Green
Write-Host "  ANDROID_HOME = $sdkRoot"
$extra = if ($toAdd -contains $emulatorDir) { ' + emulator' } else { '' }
Write-Host "  PATH += platform-tools$extra"
Write-Host ""
Write-Host "Dong TAT CA cua so Cursor/Terminal, mo PowerShell MOI va chay:" -ForegroundColor Yellow
Write-Host "  adb devices"
