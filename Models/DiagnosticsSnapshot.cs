namespace SignalRDiagnostics.Models;

public sealed record DiagnosticsSnapshot(
    int CurrentConnections,
    long TotalConnections,
    long TotalDisconnects,
    long MessagesSent,
    long MessagesReceived,
    double AverageSessionDurationSeconds,
    IReadOnlyList<ClientConnectionDto> ActiveClients,
    IReadOnlyList<HubEvent> RecentEvents);
