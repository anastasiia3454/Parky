// ==========================================
// CODE VON PERSON 1 (UNVERÄNDERT BEIBEHALTEN)
// ==========================================

const closeWindow = document.getElementById("closeModal");
const welcomeModal = document.querySelector(".welcome-window");

if (sessionStorage.getItem("modalState") === "closed" && welcomeModal) {
    welcomeModal.style.display = "none";
}

if (closeWindow && welcomeModal) {
    closeWindow.addEventListener("click", () => {
        welcomeModal.classList.add("hidden");
        sessionStorage.setItem("modalState", "closed");
        setTimeout(() => {
            welcomeModal.style.display = "none";
        }, 300);
    });
}

async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'ParkAndRideApp/1.0'
        }
    });

    const data = await response.json();

    if (!data || data.length === 0) {
        throw new Error(`Adresse nicht gefunden: "${address}"`);
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
    };
}

document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const startText = document.getElementById('start').value;
    const destText = document.getElementById('destination').value;

    document.getElementById('results').innerHTML = `<p>Adresse wird gesucht...</p>`;

    try {
        const startCoords = await geocodeAddress(startText);
        const destCoords = await geocodeAddress(destText);

        setStartMarker(startCoords.lat, startCoords.lon);

        document.getElementById('results').innerHTML = `
            <p><b>Start:</b> ${startCoords.displayName}</p>
            <p><b>Ziel:</b> ${destCoords.displayName}</p>
            <p style="color: blue; margin-top: 10px;">Suche optimale P+R Parkplätze...</p>
        `;

        const sliderElement = document.querySelector('input[type="range"]') || document.getElementById('speedSlider');
        const sliderValue = sliderElement ? parseFloat(sliderElement.value) / 100 : 0.5;

        setStartMarker(startCoords.lat, startCoords.lon);
        setDestinationMarker(destCoords.lat, destCoords.lon, destCoords.displayName);

        // Aufruf von Person 1
        const parkings = await fetchParkAndRide(
            startCoords.lat,
            startCoords.lon,
            destCoords.lat,
            destCoords.lon,
            sliderValue
        );

        if (parkings && parkings.length > 0) {
            document.getElementById('results').innerHTML += `
                <p style="color: green;">${parkings.length} P+R Parkplatz/Plätze gefunden!</p>
            `;
        } else {
            document.getElementById('results').innerHTML += `
                <p style="color: orange;">Keine P+R Parkplätze im Umkreis von 20 km gefunden.</p>
            `;
        }

        // NEU: Berechnet im Hintergrund die vollständige intermodale Route (Backend /api/Route/calculate)
        await fetchFullIntermodalRoute(startCoords.lat, startCoords.lon, destCoords.lat, destCoords.lon);

    } catch (error) {
        console.error(error);
        document.getElementById('results').innerHTML = `<p style="color: red;">Fehler bei der Suche oder API-Abfrage.</p>`;
    }
});

async function fetchParkAndRide(lat, lon, destLat = null, destLon = null, weightSpeed = 0.5) {
    try {
        let url = `http://localhost:5000/api/parkandride?lat=${lat}&lon=${lon}&weightSpeed=${weightSpeed}`;
        if (destLat && destLon) {
            url += `&destLat=${destLat}&destLon=${destLon}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Fehler beim Laden: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Gefundene P+R Daten:", data);

        const parkings = data.parkings || [];
        const directCarRoute = data.directCarRoute;

        if (directCarRoute) {
            console.log(`Direkte Autofahrt: ca. ${Math.round(directCarRoute.durationSeconds / 60)} Min.`);
        }

        if (typeof displayParkingsOnMap === "function") {
            displayParkingsOnMap(parkings, lat, lon);
        }

        return parkings;
    } catch (error) {
        console.error("API-Fehler:", error);
        return [];
    }
}


// ======================================================
// ZUSÄTZLICHE ERWEITERUNG (Gibt Daten von Route/calculate aus)
// ======================================================

async function fetchFullIntermodalRoute(originLat, originLon, targetLat, targetLon) {
    try {
        const response = await fetch('http://localhost:5000/api/Route/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originLat: originLat,
                originLon: originLon,
                targetLat: targetLat,
                targetLon: targetLon,
                departureTime: new Date().toISOString()
            })
        });

        if (!response.ok) {
            console.error("Fehler bei der Anfrage an den RouteController");
            return;
        }

        const routes = await response.json();
        const resultsDiv = document.getElementById('results');

        // Falls keine Routen im Array enthalten sind
        if (!routes || routes.length === 0) {
            resultsDiv.innerHTML += '<p style="color: #dc2626; margin-top: 10px;">⚠️ Keine passenden ÖPNV-Routen für diese Parkplätze gefunden.</p>';
            return;
        }


        // Vorherige Routenergebnisse aufräumen, falls vorhanden
        const existingContainer = document.getElementById('intermodal-results-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        if (routes && routes.length > 0) {
            const container = document.createElement('div');
            container.id = 'intermodal-results-container';
            container.style.marginTop = '15px';
            container.innerHTML = '<b>Berechnete Gesamtrouten (Auto + ÖPNV + Fußweg):</b>';

            routes.forEach((route, idx) => {
                const routeEl = document.createElement('div');
                routeEl.className = 'route-option-card';
                routeEl.style.cssText = 'background:#f3f4f6; padding:10px; border-radius:8px; margin-top:8px; font-size:13px; cursor:pointer; border:2px solid transparent; transition: all 0.2s;';

                routeEl.innerHTML = `
                    <b style="color:#111827;">Option ${idx + 1}: ${escapeHtml(route.parkingName)}</b><br>
                    🚗 ${route.driveMinutes} Min | 🅿️ ${route.parkingBufferMinutes} Min | 🚆 ${route.transitMinutes} Min | 🚶 ${route.walkingMinutes} Min<br>
                    <b style="color:#1d4ed8;">⏱️ Gesamt: ${route.totalMinutes} Min.</b>
                    <br><span style="font-size:11px; color:#6b7280;">👉 Klicken, um Gesamtroute auf der Karte zu sehen</span>
                `;

                // Erst beim Klick auf die Option wird die Route auf der Karte gezeichnet
                routeEl.addEventListener('click', () => {
                    document.querySelectorAll('.route-option-card').forEach(el => el.style.borderColor = 'transparent');
                    routeEl.style.borderColor = '#2563eb';

                    // Daten aus dem Backend (RouteResult) auslesen
                    const parkLat = route.parkingLat;
                    const parkLon = route.parkingLon;
                    const polylineTransit = route.polylineTransit;
                    const targetStopLat = route.targetStopLat;
                    const targetStopLon = route.targetStopLon;

                    if (typeof drawFullIntermodalRoute === 'function') {
                        drawFullIntermodalRoute(
                            originLat,
                            originLon,
                            parkLat,
                            parkLon,
                            targetLat,
                            targetLon,
                            polylineTransit,
                            targetStopLat,
                            targetStopLon
                        );
                    }
                });

                container.appendChild(routeEl);
            });

            resultsDiv.appendChild(container);
        }
    } catch (err) {
        console.error("Fehler bei der intermodalen Routenberechnung:", err);
    }
}