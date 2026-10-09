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
