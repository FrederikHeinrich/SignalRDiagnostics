# SignalRDiagnostics

SignalRDiagnostics is a .NET 8 ASP.NET Core SignalR diagnostics app for testing WebSocket and fallback transport behavior through Azure Application Gateway, WAF, IIS, and backend routing.

## Routes

- `/client` - interactive SignalR test client
- `/monitor` - live server-side connection dashboard
- `/testHub` - SignalR diagnostics hub
- `/api/health` - JSON health endpoint

`GET /testHub/negotiate?negotiateVersion=1` returns a diagnostic negotiate preview for manual routing tests. The Microsoft SignalR JavaScript client still uses the normal SignalR negotiate flow internally when it connects.

## Run Locally

```bash
dotnet restore
dotnet run
```

Open the local URL printed by `dotnet run`, for example:

- `http://localhost:5048/client`
- `http://localhost:5048/monitor`
- `http://localhost:5048/api/health`

The client page defaults the server base URL to the current browser origin and the hub path to `/testHub`.

The pages also support IIS virtual directories. If the app is hosted below `/SignalRDiagnostics`, open:

- `https://<server>/SignalRDiagnostics/client`
- `https://<server>/SignalRDiagnostics/monitor`
- `https://<server>/SignalRDiagnostics/api/health`

Static assets and hub URLs are resolved relative to that base path.

## Publish

Publish a framework-dependent build:

```bash
dotnet publish -c Release -o ./publish
```

Run the published app:

```bash
dotnet ./publish/SignalRDiagnostics.dll
```

For IIS, deploy the publish folder to the site root and ensure the ASP.NET Core Hosting Bundle for .NET 8 is installed on the server.

Publish a Windows self-contained build when the target server should not depend on an installed .NET runtime:

```bash
dotnet publish -c Release -r win-x64 --self-contained true -o ./publish-win-x64
```

For IIS, deploy the `publish-win-x64` folder to the site root. IIS still needs the ASP.NET Core Hosting Bundle because it provides the ASP.NET Core Module for IIS, but the app runtime itself is included in the publish output.

## GitHub Actions Release

The repository includes a GitHub Actions workflow at `.github/workflows/release.yml`.

It runs on pushes and pull requests to `main`, publishes the app, and uploads a ZIP artifact for each workflow run. When a tag starting with `v` is pushed, it also creates or updates a GitHub Release and attaches the published ZIP.

Create a release tag from PowerShell:

```powershell
$shortHash = git rev-parse --short=12 HEAD
$version = (Get-Date).ToUniversalTime().ToString("yyyy.M.d-bHHmmss") + $shortHash
git tag "v$version"
git push origin "v$version"
```

After the workflow finishes, download one of the release assets:

```text
SignalRDiagnostics-portable-YYYY.M.D-bHHMMSS<ShortHash>.zip
SignalRDiagnostics-win-x64-self-contained-YYYY.M.D-bHHMMSS<ShortHash>.zip
```

Use `portable` when the Windows Server has the .NET 8 ASP.NET Core Hosting Bundle installed. Use `win-x64-self-contained` when the server reports runtime loading errors or when you want the app runtime included in the deployment.

Deploy the ZIP contents to IIS, for example:

```text
C:\inetpub\SignalRDiagnostics
```

## IIS Runtime Troubleshooting

If IIS shows `Failed to load ASP.NET Core runtime`, check these items first:

1. Install or repair the .NET 8 ASP.NET Core Hosting Bundle on the Windows Server.
2. Run `iisreset` after installing or repairing the Hosting Bundle.
3. Set the IIS application pool to `No Managed Code`.
4. Verify that the deployed folder contains the generated `web.config`.
5. If you used the portable release ZIP, confirm `dotnet --list-runtimes` includes `Microsoft.AspNetCore.App 8.x`.
6. If the server runtime cannot be changed, deploy the `win-x64-self-contained` release ZIP instead.

Useful server commands:

```powershell
dotnet --list-runtimes
iisreset
```

## Test Through Azure Application Gateway

Deploy the app behind the Application Gateway backend pool, then open:

- `https://<gateway-host>/client`
- `https://<gateway-host>/monitor`
- `https://<gateway-host>/api/health`

Recommended test flow:

1. Open `/monitor` in one browser tab.
2. Open `/client` in another browser tab through the gateway URL.
3. Run `Test negotiate` and check HTTP status, response headers, duration, and body preview.
4. Run `Test connect` with `Auto`.
5. Repeat with `WebSockets only`, `ServerSentEvents only`, and `LongPolling only`.
6. Run `Run full test` for at least 60 seconds.
7. Watch `/monitor` for disconnects, stale pongs, suspicious clients, and server events.

When the full test finishes, `/client` shows a completion report with target settings, selected transport and authentication mode, negotiate result, connection id, echo timing, ping statistics, message counters, last error, and copy/download actions.

Example gateway URLs:

- `https://diag.example.com/client`
- `https://diag.example.com/monitor`
- `https://diag.example.com/testHub/negotiate?negotiateVersion=1`
- `https://diag.example.com/api/health`

## HTTP Status Codes

- `200` - The route is reachable. For negotiate, the SignalR endpoint responded successfully.
- `401` - Authentication is required by a gateway, IIS, reverse proxy, or upstream component.
- `403` - The request was blocked or forbidden, commonly by WAF policy, authorization rules, IP restrictions, or host/path rules.
- `404` - The route did not match. Check listener rules, path-based routing, backend path overrides, IIS site paths, and the hub path.
- `502` - The gateway could not get a valid response from the backend. Check backend health, protocol, port, TLS, host header, and app startup.
- `504` - The gateway timed out waiting for the backend. Check backend request timeout, long-running requests, WebSocket upgrade behavior, and network reachability.

## 15 Second Disconnects

The server sends diagnostics ping events every 5 seconds. Clients reply with `Pong(clientTimestamp)`. If no pong is recorded for 15 seconds, the monitor marks the client as suspicious.

A client disconnecting around 15 seconds often points to one of these issues:

- Application Gateway backend request timeout
- Backend idle timeout or keepalive mismatch
- WebSocket upgrade not reaching the backend
- WAF interruption during negotiate or upgrade
- IIS, reverse proxy, or backend routing closing the connection
- Missing sticky sessions when the deployment requires affinity

The `/client` page shows this warning when the connection closes between roughly 12 and 18 seconds:

> Connection closed around 15 seconds. Possible Azure Application Gateway/backend timeout, idle timeout, keepalive issue or WebSocket upgrade problem.

## Azure Application Gateway Settings To Check

- Backend settings request timeout
- Backend protocol and port
- Host header override
- Health probe path, such as `/api/health`
- WAF detection or prevention mode
- WebSocket support
- Backend health
- Listener host names and certificates
- Path-based routing rules for `/client`, `/monitor`, `/testHub`, and `/api/health`
- Path-based routing rules for virtual-directory deployments such as `/SignalRDiagnostics/client`, `/SignalRDiagnostics/monitor`, `/SignalRDiagnostics/testHub`, and `/SignalRDiagnostics/api/health`
- End-to-end TLS settings when the backend uses HTTPS

## Hub Methods

- `RegisterClient(clientInfo)` - registers the browser client or monitor metadata
- `Ping()` - client-initiated ping, returns a server timestamp
- `Pong(clientTimestamp)` - records a reply to a server ping
- `Echo(message)` - returns the same message for roundtrip testing
- `Broadcast(message)` - sends a message to all connected clients

The diagnostic hub does not require authentication. The client page can still send bearer tokens or browser-managed cookies when testing upstream authentication behavior.
