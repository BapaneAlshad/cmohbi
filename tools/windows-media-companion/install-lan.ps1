$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

function Select-File([string]$title, [string]$filter) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
        $dialog.Title = $title
        $dialog.Filter = $filter
        if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Pemasangan dibatalkan.' }
        return $dialog.FileName
    } finally { $dialog.Dispose() }
}

$pythonCommand = @(Get-Command python.exe -All -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -notmatch '[\\/]WindowsApps[\\/]python\.exe$' } |
    Select-Object -First 1)
$python = $null
if ($pythonCommand) { $python = (& $pythonCommand.Source -c 'import sys; print(sys.executable)' | Select-Object -Last 1) }
if (!$python) {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if (!$launcher) { throw 'Pasang Python 3.10+ terlebih dahulu.' }
    $python = (& $launcher.Source -3 -c 'import sys; print(sys.executable)').Trim()
}
$python = $python.Trim()
& $python -c 'import sys; sys.exit(sys.version_info < (3, 10))'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ diperlukan.' }
$pairFile = Select-File 'Pilih file pemasangan yang diunduh dari Ngapaya' 'Konfigurasi Ngapaya (ngapaya-storage*.json)|ngapaya-storage*.json|JSON (*.json)|*.json'
$config = Get-Content -LiteralPath $pairFile -Raw | ConvertFrom-Json
if ($config.workspace -notmatch '^[a-f0-9-]{36}$' -or $config.key -notmatch '^[A-Za-z0-9_-]{43}$' -or
    $config.storageId -notmatch '^[a-f0-9-]{36}$' -or
    $config.origin -notmatch '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$|^http://localhost(:[0-9]+)?$') {
    throw 'File pemasangan tidak valid. Unduh kembali dari Ngapaya.'
}

$folderPicker = New-Object System.Windows.Forms.FolderBrowserDialog
try {
    $folderPicker.Description = 'Pilih folder khusus untuk dibagikan di Gallery LAN'
    $folderPicker.ShowNewFolderButton = $true
    if ($folderPicker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Pemasangan dibatalkan.' }
    $folder = $folderPicker.SelectedPath
} finally { $folderPicker.Dispose() }
if ((Split-Path -Qualifier $folder) + '\' -eq $folder -or $folder.StartsWith('\\')) {
    throw 'Pilih folder khusus pada harddisk PC.'
}
$certificate = Select-File 'Pilih sertifikat HTTPS fullchain PEM' 'PEM (*.pem)|*.pem|Semua file (*.*)|*.*'
$privateKey = Select-File 'Pilih kunci privat sertifikat HTTPS PEM' 'PEM (*.pem)|*.pem|Semua file (*.*)|*.*'
& $python -c 'import ssl,sys; ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(sys.argv[1],sys.argv[2],password=lambda: "")' $certificate $privateKey
if ($LASTEXITCODE -ne 0) { throw 'Sertifikat dan kunci privat tidak dapat dipakai bersama.' }
$dnsName = (Read-Host 'Subdomain HTTPS sesuai sertifikat, tanpa https:// dan port').Trim().ToLowerInvariant()
if ($dnsName -notmatch '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' -or $dnsName.Length -gt 253) {
    throw 'Masukkan subdomain yang valid, misalnya storage.example.com.'
}
$portText = (Read-Host 'Port HTTPS [8766]').Trim()
$port = 8766
if ($portText -and (![int]::TryParse($portText, [ref]$port) -or $port -lt 1024 -or $port -gt 65535)) {
    throw 'Port harus antara 1024 dan 65535.'
}

$appDirectory = Join-Path $env:LOCALAPPDATA 'Ngapaya Storage'
if ($appDirectory.Equals($folder, [StringComparison]::OrdinalIgnoreCase) -or
    $appDirectory.StartsWith($folder.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Folder storage harus terpisah dari folder konfigurasi Ngapaya.'
}
foreach ($privateFile in @($pairFile, $certificate, $privateKey)) {
    if ($privateFile.StartsWith($folder.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Simpan sertifikat, kunci, dan file pemasangan di luar folder yang dibagikan.'
    }
}
New-Item -ItemType Directory -Path $appDirectory -Force | Out-Null
foreach ($name in @('lan_storage.py', 'lan_launcher.py')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $appDirectory $name) -Force
}
$settings = @{
    workspace = $config.workspace
    storageId = $config.storageId
    url = "https://${dnsName}:${port}"
    origin = $config.origin
    key = $config.key
    folder = $folder
    certificate = $certificate
    privateKey = $privateKey
}
$settings | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $appDirectory 'storage.json') -Encoding UTF8

$protocol = 'HKCU:\Software\Classes\ngapaya-storage'
New-Item -Path $protocol -Force | Out-Null
Set-Item -LiteralPath $protocol -Value 'URL:Ngapaya Storage'
New-ItemProperty -LiteralPath $protocol -Name 'URL Protocol' -Value '' -Force | Out-Null
$command = "$protocol\shell\open\command"
foreach ($subkey in @("$protocol\shell", "$protocol\shell\open", $command)) {
    New-Item -Path $subkey -Force | Out-Null
}
$script = Join-Path $appDirectory 'lan_launcher.py'
Set-Item -LiteralPath $command -Value ('"{0}" "{1}" "%1"' -f $python, $script)
& $python -c 'import ctypes; ctypes.windll.shell32.SHChangeNotify(0x08000000, 0x2000, None, None)' # Refresh Windows protocol associations.

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hentikan Storage LAN.lnk'))
$pythonw = Join-Path (Split-Path -Parent $python) 'pythonw.exe'
$shortcut.TargetPath = if (Test-Path -LiteralPath $pythonw -PathType Leaf) { $pythonw } else { $python }
$shortcut.Arguments = '"{0}" --stop' -f $script
$shortcut.WorkingDirectory = $appDirectory
$shortcut.Save()
Write-Host 'Pemasangan selesai. Klik Jalankan Storage LAN di Gallery LAN.'
Write-Host 'Simpan file pemasangan di tempat privat atau hapus setelah pemasangan.'
