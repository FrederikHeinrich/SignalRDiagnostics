using Microsoft.AspNetCore.SignalR;
using SignalRDiagnostics.Models;
using SignalRDiagnostics.Services;

namespace SignalRDiagnostics.Hubs;

public sealed class TestHub(ConnectionTracker tracker, ILogger<TestHub> logger) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var hubEvent = tracker.AddConnection(Context.ConnectionId, UserAgent());
        logger.LogInformation("SignalR connected: {ConnectionId}", Context.ConnectionId);
        await PublishEventAsync(hubEvent);
        await SendMonitorUpdateAsync();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var hubEvent = tracker.RemoveConnection(Context.ConnectionId, exception?.Message);
        logger.LogInformation("SignalR disconnected: {ConnectionId}", Context.ConnectionId);
        await PublishEventAsync(hubEvent);
        await SendMonitorUpdateAsync();
        await base.OnDisconnectedAsync(exception);
    }

    public async Task RegisterClient(ClientInfo clientInfo)
    {
        try
        {
            var isMonitor = string.Equals(clientInfo.Role, "monitor", StringComparison.OrdinalIgnoreCase);
            var addGroup = isMonitor ? HubGroups.Monitors : HubGroups.DiagnosticClients;
            var removeGroup = isMonitor ? HubGroups.DiagnosticClients : HubGroups.Monitors;

            await Groups.RemoveFromGroupAsync(Context.ConnectionId, removeGroup);
            await Groups.AddToGroupAsync(Context.ConnectionId, addGroup);

            var hubEvent = tracker.RegisterClient(Context.ConnectionId, clientInfo);
            await PublishEventAsync(hubEvent);
            await SendMonitorUpdateAsync();
        }
        catch (Exception exception)
        {
            await PublishErrorAsync("RegisterClient failed", exception);
            throw new HubException("RegisterClient failed.");
        }
    }

    public async Task<PingResult> Ping()
    {
        try
        {
            var hubEvent = tracker.RecordClientPing(Context.ConnectionId);
            tracker.AddMessagesSent(1);
            await PublishEventAsync(hubEvent);
            await SendMonitorUpdateAsync();

            return new PingResult(Context.ConnectionId, DateTimeOffset.UtcNow, "pong");
        }
        catch (Exception exception)
        {
            await PublishErrorAsync("Ping failed", exception);
            throw new HubException("Ping failed.");
        }
    }

    public async Task<PongResult> Pong(string? clientTimestamp)
    {
        try
        {
            var hubEvent = tracker.RecordPong(Context.ConnectionId, clientTimestamp);
            tracker.AddMessagesSent(1);
            await PublishEventAsync(hubEvent);
            await SendMonitorUpdateAsync();

            return new PongResult(Context.ConnectionId, DateTimeOffset.UtcNow, clientTimestamp, "pong recorded");
        }
        catch (Exception exception)
        {
            await PublishErrorAsync("Pong failed", exception);
            throw new HubException("Pong failed.");
        }
    }

    public async Task<EchoResult> Echo(string? message)
    {
        try
        {
            var value = message ?? "";
            var hubEvent = tracker.RecordEcho(Context.ConnectionId, value);
            await PublishEventAsync(hubEvent);
            await SendMonitorUpdateAsync();

            return new EchoResult(Context.ConnectionId, value, DateTimeOffset.UtcNow);
        }
        catch (Exception exception)
        {
            await PublishErrorAsync("Echo failed", exception);
            throw new HubException("Echo failed.");
        }
    }

    public async Task<BroadcastResult> Broadcast(string? message)
    {
        try
        {
            var value = message ?? "";
            var recipients = tracker.CurrentConnectionCount;
            var payload = new
            {
                connectionId = Context.ConnectionId,
                message = value,
                serverTimestamp = DateTimeOffset.UtcNow
            };

            await Clients.All.SendAsync("BroadcastMessage", payload);

            var hubEvent = tracker.RecordBroadcast(Context.ConnectionId, value, recipients);
            await PublishEventAsync(hubEvent);
            await SendMonitorUpdateAsync();

            return new BroadcastResult(Context.ConnectionId, value, recipients, DateTimeOffset.UtcNow);
        }
        catch (Exception exception)
        {
            await PublishErrorAsync("Broadcast failed", exception);
            throw new HubException("Broadcast failed.");
        }
    }

    private async Task PublishErrorAsync(string message, Exception exception)
    {
        logger.LogError(exception, "{Message} for {ConnectionId}", message, Context.ConnectionId);
        var hubEvent = tracker.RecordError(Context.ConnectionId, $"{message}: {exception.Message}");
        await PublishEventAsync(hubEvent);
        await SendMonitorUpdateAsync();
    }

    private async Task PublishEventAsync(HubEvent hubEvent)
    {
        await Clients.Group(HubGroups.Monitors).SendAsync("ServerEvent", hubEvent);
        await Clients.All.SendAsync("DiagnosticsEvent", hubEvent);
    }

    private Task SendMonitorUpdateAsync()
    {
        return Clients.Group(HubGroups.Monitors).SendAsync("MonitorUpdate", tracker.GetSnapshot());
    }

    private string? UserAgent()
    {
        return Context.GetHttpContext()?.Request.Headers["User-Agent"].ToString();
    }
}
