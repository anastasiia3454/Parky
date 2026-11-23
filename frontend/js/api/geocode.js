import { NOMINATIM_URL } from '../config.js';

export async function geocodeAddress(address) {
    const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(address)}`;

    const response = await fetch(url, {
        headers: { 'User-Agent': 'ParkAndRideApp/1.0' }
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