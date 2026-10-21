const map = L.map('map').setView([52.5200, 13.4050], 11);

L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let startMarker = null;
let destinationMarker = null;
let parkingMarkers = [];
let currentDriveRouteLayer = null;


const mapContainer = document.getElementById('map');
if (mapContainer && 'ResizeObserver' in window) {
    new ResizeObserver(() => map.invalidateSize()).observe(mapContainer);
}
window.addEventListener('resize', () => map.invalidateSize());

function isValidCoord(value) {
    return typeof value === 'number' && isFinite(value);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function attachPopup(marker, html, radius) {
    marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        map.invalidateSize();

        L.popup({
            offset: [0, -radius],
            autoPan: true,
            autoPanPadding: [20, 20],
            closeOnClick: true
        })
        .setLatLng(marker.getLatLng())
        .setContent(html)
        .openOn(map);
    });
}

map.on('popupopen', function (e) {
    const btn = e.popup.getElement().querySelector('.route-btn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        drawDriveRoute(
            parseFloat(btn.dataset.startLat),
            parseFloat(btn.dataset.startLon),
            parseFloat(btn.dataset.parkLat),
            parseFloat(btn.dataset.parkLon)
        );
    });
});


function setStartMarker(lat, lon) {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    const radius = 9;

    startMarker = L.circleMarker([lat, lon], {
        radius: radius,
        color: '#bfdbfe',
        fillColor: '#1d4ed8',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(map);

    attachPopup(startMarker, '<b>Dein Startpunkt</b>', radius);
}

function setDestinationMarker(lat, lon, name = 'Dein Zielpunkt') {
    if (!isValidCoord(lat) || !isValidCoord(lon)) return;

    if (destinationMarker) {
        map.removeLayer(destinationMarker);
    }

    const radius = 9;

    destinationMarker = L.circleMarker([lat, lon], {
        radius: radius,
        color: '#ff751f',
        fillColor: '#111827',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(map);

    attachPopup(destinationMarker, `<b>Ziel:</b><br>${escapeHtml(name)}`, radius);
}


function displayParkingsOnMap(parkings, startLat, startLon) {
    map.invalidateSize();

    parkingMarkers.forEach(marker => map.removeLayer(marker));
    parkingMarkers = [];

    parkings.forEach((p, index) => {
        if (!isValidCoord(p.lat) || !isValidCoord(p.lon)) return;

        const isBestOption = index === 0;
        const radius = isBestOption ? 12 : 7;

        const marker = L.circleMarker([p.lat, p.lon], {
            radius: radius,
            color: '#a7f3d0',
            fillColor: isBestOption ? '#047857' : '#16331f',
            fillOpacity: isBestOption ? 1.0 : 0.8,
            weight: isBestOption ? 3 : 1
        }).addTo(map);

        const minutes = Math.round(p.driveDurationSeconds / 60);

        attachPopup(marker, `
            <b>${isBestOption ? '⭐ Bester P+R Platz: ' : ''}${escapeHtml(p.name)}</b><br>
            Fahrzeit Auto: ca. ${minutes} Min.<br>
            ${p.score ? `Score: ${p.score.toFixed(1)}<br>` : ''}<br>
            <button class="route-btn"
                    data-start-lat="${startLat}"
                    data-start-lon="${startLon}"
                    data-park-lat="${p.lat}"
                    data-park-lon="${p.lon}">
                Auto-Route anzeigen
            </button>
        `, radius);

        parkingMarkers.push(marker);
    });

    const allLayers = [...parkingMarkers];
    if (startMarker) allLayers.push(startMarker);
    if (destinationMarker) allLayers.push(destinationMarker);

    if (allLayers.length > 0) {
        const group = L.featureGroup(allLayers);
        map.fitBounds(group.getBounds().pad(0.15));
    }
}


async function drawDriveRoute(startLat, startLon, parkLat, parkLon) {
    if (currentDriveRouteLayer) {
        map.removeLayer(currentDriveRouteLayer);
        currentDriveRouteLayer = null;
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${parkLon},${parkLat}?overview=full&geometries=geojson`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            currentDriveRouteLayer = L.geoJSON(data.routes[0].geometry, {
                style: {
                    color: '#00bfff',
                    weight: 5,
                    opacity: 0.8
                }
            }).addTo(map);

            map.fitBounds(currentDriveRouteLayer.getBounds().pad(0.1));
        }
    } catch (error) {
        console.error('Fehler beim Abrufen der Auto-Route:', error);
    }
}