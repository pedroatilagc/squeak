# Sobe o LiveKit local com podman (sem compose). Lê as chaves do .env na raiz (não versionado).
$vars = @{}
Get-Content "$PSScriptRoot\..\.env" | Where-Object { $_ -match '^LIVEKIT_API_(KEY|SECRET)=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  $vars[$k] = $v
}
podman rm -f squak-livekit 2>$null | Out-Null
podman run -d --name squak-livekit -p 7880:7880 -p 7881:7881 -p 7882:7882/udp `
  -e "LIVEKIT_KEYS=$($vars['LIVEKIT_API_KEY']): $($vars['LIVEKIT_API_SECRET'])" `
  docker.io/livekit/livekit-server:latest --bind 0.0.0.0
