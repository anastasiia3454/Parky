using Backend.Services;

// Der Server wird vorbereitet
var builder = WebApplication.CreateBuilder(args);

// Erlaubnis geben, dass die Webseite mit diesem Server reden darf (CORS)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Wichtige Werkzeuge anmelden: Internet-Verbindung (HTTP-Client) und Zwischenspeicher (Cache)
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

// Dem Server sagen, welche Controller und Arbeiter Services es gibt
builder.Services.AddControllers();
builder.Services.AddScoped<TransitService>();
builder.Services.AddScoped<ParkAndRideService>();

// Jetzt wird der Server zusammengebaut
var app = builder.Build();

// Regeln anwenden
app.UseCors();
app.MapControllers();

//Der Server wird gestartet
app.Run();