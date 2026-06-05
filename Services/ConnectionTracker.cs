using System.Collections.Concurrent;
using SignalRDiagnostics.Models;

namespace SignalRDiagnostics.Services;

public sealed class ConnectionTracker
{
    private const int MaxEvents = 250;

    private readonly ConcurrentDictionary<string, ClientConnection> _connections = new();
    private readonly Queue<HubEvent> _events = new();
    private readonly object _eventsLock = new();
    private long _completedSessionTicks;
    private long _completedSessions;
    private long _eventId;
    private long _messagesReceived;
    private long _messagesSent;
    private long _totalConnections;
    private long _totalDisconnects;

    public HubEvent AddConnection(string connectionId, string? userAgent)
    {
        var now = DateTimeOffset.UtcNow;
        var connection = new ClientConnection
        {
            ConnectionId = connectionId,
            ClientId = connectionId,
            ConnectedSince = now,
            LastSeen = now,
            UserAgent = userAgent
        };

        _connections[connectionId] = connection;
        Interlocked.Increment(ref _totalConnections);

        return AddEvent("connected", connection, "SignalR connection opened");
    }

    public HubEvent RegisterClient(string connectionId, ClientInfo clientInfo)
    {
        var connection = GetOrCreateConnection(connectionId);
        var role = IsMonitor(clientInfo.Role) ? "monitor" : "client";

        connection.ClientId = FirstValue(clientInfo.ClientId, connection.ClientId, connectionId);
        connection.Role = role;
        connection.Status = role == "monitor" ? "monitor" : "connected";
        connection.LastSeen = DateTimeOffset.UtcNow;
        connection.PageUrl = FirstValue(clientInfo.PageUrl, connection.PageUrl);
        connection.UserAgent = FirstValue(clientInfo.UserAgent, connection.UserAgent);
        connection.TransportMode = FirstValue(clientInfo.TransportMode, connection.TransportMode);
        connection.AuthMode = FirstValue(clientInfo.AuthMode, connection.AuthMode);

        return AddEvent("connected", connection, $"Registered {role} client");
    }

    public HubEvent RemoveConnection(string connectionId, string? error)
    {
        var now = DateTimeOffset.UtcNow;
        if (!_connections.TryRemove(connectionId, out var connection))
        {
            connection = new ClientConnection
            {
                ConnectionId = connectionId,
                ClientId = connectionId,
                ConnectedSince = now,
                LastSeen = now,
                Status = "disconnected"
            };
        }

        connection.DisconnectedAt = now;
        connection.LastSeen = now;
        connection.Status = "disconnected";

        var duration = now - connection.ConnectedSince;
        Interlocked.Increment(ref _totalDisconnects);
        Interlocked.Increment(ref _completedSessions);
        Interlocked.Add(ref _completedSessionTicks, duration.Ticks);

        return AddEvent(
            "disconnected",
            connection,
            error is null ? "SignalR connection closed" : $"SignalR connection closed: {error}",
            new Dictionary<string, object?>
            {
                ["durationSeconds"] = Math.Max(0, duration.TotalSeconds)
            });
    }

    public HubEvent RecordClientPing(string connectionId)
    {
        AddMessagesReceived(1);
        var connection = Touch(connectionId);
        connection.LastPing = DateTimeOffset.UtcNow;
        connection.MessagesReceived++;

        return AddEvent("ping", connection, "Client invoked Ping");
    }

    public IReadOnlyList<HubEvent> RecordServerPing(DateTimeOffset now, long sequence)
    {
        var clients = _connections.Values
            .Where(connection => connection.Role == "client")
            .OrderBy(connection => connection.ConnectedSince)
            .ToArray();

        if (clients.Length == 0)
        {
            return Array.Empty<HubEvent>();
        }

        AddMessagesSent(clients.Length);
        var events = new List<HubEvent>(clients.Length);

        foreach (var connection in clients)
        {
            connection.LastPing = now;
            connection.LastSeen = now;
            connection.MessagesSent++;
            events.Add(AddEvent(
                "ping",
                connection,
                "Server sent ping event",
                new Dictionary<string, object?> { ["sequence"] = sequence }));
        }

        return events;
    }

    public HubEvent RecordPong(string connectionId, string? clientTimestamp)
    {
        AddMessagesReceived(1);
        var connection = Touch(connectionId);
        connection.LastPong = DateTimeOffset.UtcNow;
        connection.MessagesReceived++;

        if (connection.Role != "monitor")
        {
            connection.Status = "connected";
        }

        return AddEvent(
            "pong",
            connection,
            "Client replied with Pong",
            new Dictionary<string, object?> { ["clientTimestamp"] = clientTimestamp });
    }

    public HubEvent RecordEcho(string connectionId, string message)
    {
        AddMessagesReceived(1);
        AddMessagesSent(1);
        var connection = Touch(connectionId);
        connection.MessagesReceived++;
        connection.MessagesSent++;

        return AddEvent("echo", connection, $"Echo: {TrimForLog(message)}");
    }

    public HubEvent RecordBroadcast(string connectionId, string message, int recipients)
    {
        AddMessagesReceived(1);
        AddMessagesSent(recipients);
        var connection = Touch(connectionId);
        connection.MessagesReceived++;

        return AddEvent(
            "broadcast",
            connection,
            $"Broadcast: {TrimForLog(message)}",
            new Dictionary<string, object?> { ["recipients"] = recipients });
    }

    public HubEvent RecordError(string connectionId, string message)
    {
        var connection = Touch(connectionId);
        connection.Status = "error";

        return AddEvent("error", connection, message);
    }

    public IReadOnlyList<HubEvent> MarkSuspicious(DateTimeOffset now, TimeSpan staleAfter)
    {
        var events = new List<HubEvent>();

        foreach (var connection in _connections.Values.Where(connection => connection.Role == "client"))
        {
            var referenceTime = connection.LastPong ?? connection.ConnectedSince;
            var age = now - referenceTime;

            if (age < staleAfter || connection.Status == "suspicious")
            {
                continue;
            }

            connection.Status = "suspicious";
            events.Add(AddEvent(
                "error",
                connection,
                $"No Pong received for {Math.Round(age.TotalSeconds)} seconds",
                new Dictionary<string, object?> { ["staleAfterSeconds"] = staleAfter.TotalSeconds }));
        }

        return events;
    }

    public int CurrentConnectionCount => _connections.Count;

    public void AddMessagesSent(long count)
    {
        if (count > 0)
        {
            Interlocked.Add(ref _messagesSent, count);
        }
    }

    private void AddMessagesReceived(long count)
    {
        if (count > 0)
        {
            Interlocked.Add(ref _messagesReceived, count);
        }
    }

    public DiagnosticsSnapshot GetSnapshot()
    {
        var now = DateTimeOffset.UtcNow;
        var activeConnections = _connections.Values
            .OrderBy(connection => connection.ConnectedSince)
            .Select(connection => connection.ToDto(now))
            .ToArray();

        var activeTicks = _connections.Values.Sum(connection => Math.Max(0, (now - connection.ConnectedSince).Ticks));
        var completedTicks = Interlocked.Read(ref _completedSessionTicks);
        var completedSessions = Interlocked.Read(ref _completedSessions);
        var sessionCount = completedSessions + activeConnections.Length;
        var averageSeconds = sessionCount == 0
            ? 0
            : TimeSpan.FromTicks((completedTicks + activeTicks) / sessionCount).TotalSeconds;

        return new DiagnosticsSnapshot(
            activeConnections.Length,
            Interlocked.Read(ref _totalConnections),
            Interlocked.Read(ref _totalDisconnects),
            Interlocked.Read(ref _messagesSent),
            Interlocked.Read(ref _messagesReceived),
            averageSeconds,
            activeConnections,
            GetRecentEvents());
    }

    private ClientConnection Touch(string connectionId)
    {
        var connection = GetOrCreateConnection(connectionId);
        connection.LastSeen = DateTimeOffset.UtcNow;
        return connection;
    }

    private ClientConnection GetOrCreateConnection(string connectionId)
    {
        return _connections.GetOrAdd(connectionId, id =>
        {
            var now = DateTimeOffset.UtcNow;
            Interlocked.Increment(ref _totalConnections);

            return new ClientConnection
            {
                ConnectionId = id,
                ClientId = id,
                ConnectedSince = now,
                LastSeen = now
            };
        });
    }

    private HubEvent AddEvent(
        string eventType,
        ClientConnection connection,
        string message,
        IReadOnlyDictionary<string, object?>? details = null)
    {
        var hubEvent = new HubEvent(
            Interlocked.Increment(ref _eventId),
            DateTimeOffset.UtcNow,
            eventType,
            connection.ConnectionId,
            connection.ClientId,
            message,
            details);

        lock (_eventsLock)
        {
            _events.Enqueue(hubEvent);
            while (_events.Count > MaxEvents)
            {
                _events.Dequeue();
            }
        }

        return hubEvent;
    }

    private IReadOnlyList<HubEvent> GetRecentEvents()
    {
        lock (_eventsLock)
        {
            return _events.ToArray();
        }
    }

    private static bool IsMonitor(string? role)
    {
        return string.Equals(role?.Trim(), "monitor", StringComparison.OrdinalIgnoreCase);
    }

    private static string FirstValue(params string?[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";
    }

    private static string TrimForLog(string value)
    {
        const int maxLength = 160;
        return value.Length <= maxLength ? value : value[..maxLength] + "...";
    }
}
