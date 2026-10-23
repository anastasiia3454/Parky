using Backend.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

builder.Services.AddControllers();
builder.Services.AddScoped<TransitService>();
builder.Services.AddScoped<ParkAndRideService>();

var app = builder.Build();

app.UseCors();
app.MapControllers();

app.Run();