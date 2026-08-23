param(
  [string]$UmamiHost = "https://stats.aerocoreos.com",
  [string]$Username = "admin"
)

$ErrorActionPreference = "Stop"
$UmamiHost = $UmamiHost.TrimEnd('/')

Write-Host "AeroVista Local -> Umami registration" -ForegroundColor Cyan
Write-Host "Server: $UmamiHost"
Write-Host "User:   $Username"
Write-Host ""

$credential = Get-Credential -UserName $Username -Message "Enter the Umami login for $UmamiHost"
$password = $credential.GetNetworkCredential().Password

$loginBody = @{
  username = $credential.UserName
  password = $password
} | ConvertTo-Json

try {
  $loginParams = @{
    Uri         = "$UmamiHost/api/auth/login"
    Method      = "Post"
    ContentType = "application/json"
    Body        = $loginBody
  }
  $login = Invoke-RestMethod @loginParams
}
finally {
  $password = $null
  $loginBody = $null
}

if (-not $login.token) {
  throw "Umami login succeeded without returning an API token."
}

$headers = @{
  Authorization = "Bearer $($login.token)"
  Accept        = "application/json"
}

$targets = @(
  [pscustomobject]@{ Name = "AeroVista Local - CDA Fair Day"; Domain = "cdafair.aerovista.us" },
  [pscustomobject]@{ Name = "AeroVista Local - Lake Day";     Domain = "lakeday.aerovista.us" },
  [pscustomobject]@{ Name = "AeroVista Local - CDA Tonight";  Domain = "cdatonight.aerovista.us" },
  [pscustomobject]@{ Name = "AeroVista Local - FireWatch";    Domain = "aerovista-us.github.io" },
  [pscustomobject]@{ Name = "AeroVista Local - LotScope";     Domain = "lotscope.aerovista.us" },
  [pscustomobject]@{ Name = "AeroVista Local - TrustScope";   Domain = "trustscope.aerovista.us" }
)

$listParams = @{
  Uri     = "$UmamiHost/api/websites?pageSize=100"
  Headers = $headers
  Method  = "Get"
}
$existingResponse = Invoke-RestMethod @listParams
$existing = @($existingResponse.data)
$results = @()

foreach ($target in $targets) {
  $shortName = $target.Name -replace '^AeroVista Local - ', ''
  $match = $existing | Where-Object {
    $_.name -eq $target.Name -or
    ($_.domain -eq $target.Domain -and $_.name -match [regex]::Escape($shortName))
  } | Select-Object -First 1

  if ($match) {
    Write-Host "EXISTS  $($target.Name)  [$($match.id)]" -ForegroundColor DarkGray
    $site = $match
    $status = "existing"
  }
  else {
    $body = @{
      name   = $target.Name
      domain = $target.Domain
    } | ConvertTo-Json

    $createParams = @{
      Uri         = "$UmamiHost/api/websites"
      Headers     = $headers
      Method      = "Post"
      ContentType = "application/json"
      Body        = $body
    }
    $site = Invoke-RestMethod @createParams

    Write-Host "CREATED $($target.Name)  [$($site.id)]" -ForegroundColor Green
    $status = "created"
    $existing += $site
  }

  $tracker = '<script defer src="{0}/script.js" data-website-id="{1}"></script>' -f $UmamiHost, $site.id

  $results += [pscustomobject]@{
    name      = $target.Name
    domain    = $target.Domain
    websiteId = $site.id
    status    = $status
    tracker   = $tracker
  }
}

$outFile = Join-Path (Get-Location) "umami-local-websites.json"
$results | ConvertTo-Json -Depth 4 | Set-Content -Path $outFile -Encoding UTF8

Write-Host ""
Write-Host "Done. Website IDs + tracker snippets:" -ForegroundColor Cyan
$results | Format-Table name, domain, websiteId, status -AutoSize
Write-Host ""
Write-Host "Saved: $outFile" -ForegroundColor Cyan
Write-Host "No password or token was written to disk."
