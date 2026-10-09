const map = L.map('map').setView([52.5200, 13.4050], 11);

L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let startMarker = null;
let destinationMarker = null;
let parkingMarkers = [];
let currentDriveRouteLayer = null;

function setStartMarker(lat, lon) {
    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.circleMarker([lat, lon], {
        radius: 9,
        color: '#bfdbfe',      
        fillColor: '#1d4ed8',
        fillOpacity: 0.9,
        weight: 2
    })
    .addTo(map)
    .bindPopup("<b>Dein Startpunkt</b>")
    .openPopup();
}

function setDestinationMarker(lat, lon, name = "Dein Zielpunkt") {
    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }

    destinationMarker = L.circleMarker([lat, lon], {
        radius: 9,
        color: '#ff751f',
        fillColor: '#111827',
        fillOpacity: 0.9,
        weight: 2
    })
    .addTo(map)
    .bindPopup(`<b>Ziel:</b><br>${name}`)
    .openPopup();
}

function displayParkingsOnMap(parkings, startLat, startLon) {
    // Alte Marker entfernen
    parkingMarkers.forEach(marker => map.removeLayer(marker));
    parkingMarkers = [];

    parkings.forEach((p, index) => {
        if (p.lat && p.lon) {
            const isBestOption = index === 0;

            const marker = L.circleMarker([p.lat, p.lon], {
                radius: isBestOption ? 12 : 7,
                color: isBestOption ? '#a7f3d0' : '#a7f3d0',
                fillColor: isBestOption ? '#047857' : '#rgb(22, 51, 31)',
                fillOpacity: isBestOption ? 1.0 : 0.8,
                weight: isBestOption ? 3 : 1
            })
            .addTo(map)
            .bindPopup(`
                <b>${isBestOption ? '⭐ Bester P+R Platz: ' : ''}${p.name}</b><br>
                Fahrzeit Auto: ca. ${Math.round(p.driveDurationSeconds / 60)} Min.<br>
                ${p.score ? `Score: ${p.score.toFixed(1)}<br>` : ''}<br>
                <button onclick="drawDriveRoute(${startLat}, ${startLon}, ${p.lat}, ${p.lon})">
                    Auto-Route anzeigen
                </button>
            `);

            parkingMarkers.push(marker);
        }
    });

    const allLayers = [...parkingMarkers];
    if (startMarker) allLayers.push(startMarker);
    if (destinationMarker) allLayers.push(destinationMarker);

    if (allLayers.length > 0) {
        const group = new L.featureGroup(allLayers);
        map.fitBounds(group.getBounds().pad(0.15));
    }
}