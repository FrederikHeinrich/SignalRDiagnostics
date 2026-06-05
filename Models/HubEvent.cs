namespace SignalRDiagnostics.Models;

public sealed record HubEvent(
    long Id,
    DateTimeOffset Time,
    string EventType,
    string ConnectionId,
    string ClientId,
    string Message,
    IReadOnlyDictionary<string, object?>? Details = null);
