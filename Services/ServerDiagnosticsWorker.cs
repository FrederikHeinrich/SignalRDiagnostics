using Microsoft.AspNetCore.SignalR;
using SignalRDiagnostics.Hubs;
using SignalRDiagnostics.Models;

namespace SignalRDiagnostics.Services;

public sealed class ServerDiagnosticsWorker(
    IHubContext<TestHub> hubContext,
    ConnectionTracker tracker,
    ILogger<ServerDiagnosticsWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PingInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan SuspiciousAfter = TimeSpan.FromSeconds(15);
    private long _sequence;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PingInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Server diagnostics worker failed.");
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var sequence = Interlocked.Increment(ref _sequence);
        var pingEvents = tracker.RecordServerPing(now, sequence);

        if (pingEvents.Count > 0)
        {
            await hubContext.Clients.Group(HubGroups.DiagnosticClients).SendAsync(
                "ServerPing",
                new
                {
                    sequence,
                    serverTimestamp = now,
                    intervalSeconds = PingInterval.TotalSeconds
                },
                cancellationToken);

            foreach (var hubEvent in pingEvents)
            {
                await PublishEventAsync(hubEvent, cancellationToken);
            }
        }

        foreach (var hubEvent in tracker.MarkSuspicious(now, SuspiciousAfter))
        {
            await PublishEventAsync(hubEvent, cancellationToken);
        }

        await hubContext.Clients.Group(HubGroups.Monitors).SendAsync(
            "MonitorUpdate",
            tracker.GetSnapshot(),
            cancellationToken);
    }

    private async Task PublishEventAsync(HubEvent hubEvent, CancellationToken cancellationToken)
    {
        await hubContext.Clients.Group(HubGroups.Monitors).SendAsync("ServerEvent", hubEvent, cancellationToken);
        await hubContext.Clients.All.SendAsync("DiagnosticsEvent", hubEvent, cancellationToken);
    }
}
