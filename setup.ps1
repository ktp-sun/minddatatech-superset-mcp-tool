$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$configPath = Join-Path $PSScriptRoot 'env.json'
if (Test-Path -LiteralPath $configPath) { throw 'env.json already exists. Use configure_credentials in your MCP client to update it.' }
$url = Read-Host 'Superset URL (default https://superset.minddatatech.com)'
if (-not $url) { $url = 'https://superset.minddatatech.com' }
$parsed = $null
if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$parsed) -or $parsed.Scheme -ne 'https') { throw 'Please enter an absolute HTTPS URL.' }
$username = Read-Host 'Superset username'
$passwordSecure = Read-Host 'Superset password (saved locally as plaintext)' -AsSecureString
if (-not $username -or $passwordSecure.Length -eq 0) { throw 'Username and password are required.' }
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$json = @{ SUPERSET_URL = $url; SUPERSET_USERNAME = $username; SUPERSET_PASSWORD = $password; SUPERSET_PROVIDER = 'db' } | ConvertTo-Json
[IO.File]::WriteAllText($configPath, $json, [Text.UTF8Encoding]::new($false))
$password = $null
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Your configuration was saved; run npm ci --ignore-scripts after resolving the error.' }
Write-Host 'Setup complete. Connect your MCP client as described in README.md. Credentials have not yet been verified.'
