using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;

internal static class AuthoringEndpoints
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    public static void MapAuthoring(this WebApplication app)
    {
        app.MapMethods("/api/authoring", ["GET", "POST"], async (HttpContext context) =>
        {
            if (!app.Environment.IsDevelopment() || !app.Configuration.GetValue<bool>("Authoring:Enabled")) return Results.NotFound();
            if (context.Connection.RemoteIpAddress is not { } address || !IPAddress.IsLoopback(address)) return Results.StatusCode(403);
            var token = app.Configuration["Authoring:Token"];
            if (string.IsNullOrEmpty(token) || token.Length < 32) return Results.Problem("Локальный ключ редактора не настроен.", statusCode: 503);
            var supplied = context.Request.Headers.Authorization.ToString();
            if (!supplied.StartsWith("Bearer ", StringComparison.Ordinal) || !CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(supplied[7..])), SHA256.HashData(Encoding.UTF8.GetBytes(token)))) return Results.Json(new { error = "Нужен ключ управления контентом." }, statusCode: 401);
            var origin = context.Request.Headers.Origin.ToString();
            if (origin.Length > 0 && (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") || uri.Host is not ("localhost" or "127.0.0.1" or "[::1]"))) return Results.StatusCode(403);
            context.Response.Headers.CacheControl = "no-store";
            if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit) limit.MaxRequestBodySize = 2_000_000;
            string input;
            try { input = context.Request.Method == "GET" ? "{\"action\":\"load\"}" : await new StreamReader(context.Request.Body).ReadToEndAsync(context.RequestAborted); }
            catch (BadHttpRequestException) { return Results.Json(new { error = "Запрос превышает допустимый размер." }, statusCode: 413); }
            if (Encoding.UTF8.GetByteCount(input) > 2_000_000) return Results.StatusCode(413);
            if (!await Gate.WaitAsync(TimeSpan.FromSeconds(10), context.RequestAborted)) return Results.Json(new { error = "Редактор занят другим сохранением." }, statusCode: 409);
            try
            {
                var repository = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "../.."));
                var start = new ProcessStartInfo(app.Configuration["Authoring:Node"] ?? "node") { WorkingDirectory = repository, UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
                start.ArgumentList.Add("--experimental-strip-types"); start.ArgumentList.Add(Path.Combine(repository, "scripts/authoring-command.mjs"));
                using var process = Process.Start(start) ?? throw new InvalidOperationException("Не удалось запустить валидатор.");
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                var output = process.StandardOutput.ReadToEndAsync(timeout.Token); var errors = process.StandardError.ReadToEndAsync(timeout.Token);
                try { await process.StandardInput.WriteAsync(input); process.StandardInput.Close(); await process.WaitForExitAsync(timeout.Token); }
                catch { if (!process.HasExited) process.Kill(true); throw; }
                var response = JsonDocument.Parse(await output); var value = response.RootElement;
                if (process.ExitCode != 0) { app.Logger.LogError("Authoring validator: {Error}", await errors); return Results.Problem("Ошибка валидатора редактора.", statusCode: 500); }
                return Results.Json(value.TryGetProperty("data", out var data) ? data.Clone() : new { error = value.GetProperty("error").GetString() } as object, statusCode: value.GetProperty("status").GetInt32());
            }
            catch (Exception error) { app.Logger.LogError(error, "Authoring operation failed"); return Results.Json(new { error = "Не удалось подтвердить результат операции. Обновите список перед повтором и проверьте журнал сервера." }, statusCode: 500); }
            finally { Gate.Release(); }
        });
    }
}
