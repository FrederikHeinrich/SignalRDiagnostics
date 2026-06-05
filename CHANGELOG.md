# Changelog

## [0.3.3] - 2026-06-05

### Fixed

- Format long client request URLs across multiple log lines with one query parameter per line.

## [0.3.2] - 2026-06-05

### Fixed

- Wrap long live log and report lines so URLs and query strings stay inside the visible log panel, with a cache-busted stylesheet reference.

## [0.3.1] - 2026-06-05

### Added

- Add sanitized request header, cookie, and query diagnostics to monitor server event logs for negotiate and connection events.
- Add client request expectation metadata with trace ids, missing item detection, and proxy/gateway warnings.
- Replay recent server events from monitor snapshots so diagnostics remain visible after opening or reconnecting the monitor.

## [0.3.0] - 2026-06-05

### Added

- Add a full test completion report with timing, target, transport, auth, negotiate, connection, echo, ping, message, error, copy, and JSON download details.

## [0.2.3] - 2026-06-05

### Fixed

- Prevent live logs from forcing the scroll position to the bottom while a user is reading older entries.

## [0.2.2] - 2026-06-05

### Fixed

- Fix CSS, JavaScript, navigation, redirects, negotiate diagnostics, and hub URLs when hosted below an IIS virtual directory such as `/SignalRDiagnostics`.

## [0.2.1] - 2026-06-05

### Added

- Add Windows `win-x64` self-contained release ZIP for IIS servers with runtime loading issues.
- Add README troubleshooting for `Failed to load ASP.NET Core runtime`.

## [0.2.0] - 2026-06-05

### Added

- Add GitHub Actions build, publish artifact, and tag-based release workflow.
- Add README instructions for creating release tags and deploying release ZIPs.

## [0.1.0] - 2026-06-05

### Added

- Add the initial .NET 8 SignalR diagnostics web app with client, monitor, hub, and health routes.
- Add transport, authentication, negotiate, connect, echo, ping, and full-test diagnostics.
- Add live server monitoring with connection metrics, active clients, stale pong detection, and event logs.
- Add Azure Application Gateway testing guidance in the README.
