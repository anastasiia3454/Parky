// Parkgebühr nach Tarif aus OSM (charge), genau nach Minuten.
// Erkannt werden "2 EUR/hour" bzw. "2 €/h" und optional "max. 12 EUR/day".
export function parseParkingRule(text) {
    if (!text) return null;
    const normalized = String(text).replace(/,/g, '.');
    const hourly = normalized.match(/(\d+(?:\.\d+)?)\s*(?:€|EUR)?\s*\/\s*(?:h|Std|std|hour)/i);
    if (!hourly) return null;
    const daily = normalized.match(/max\.?\s*(\d+(?:\.\d+)?)\s*(?:€|EUR)?\s*\/\s*(?:day|d|Tag|tag)/i);
    return {
        hourly: parseFloat(hourly[1]),
        dailyMax: daily ? parseFloat(daily[1]) : null
    };
}

// Gibt die Gebühr in Euro zurück, 0 bei kostenlos, null wenn der Tarif unbekannt ist
export function calcParkingFee(route, minutes) {
    if (route.feeStatus === 'free') return 0;
    const rule = parseParkingRule(route.feeDescription);
    if (!rule) return null;

    const hours = minutes / 60;
    let cost = rule.hourly * hours;
    if (rule.dailyMax !== null) {
        cost = Math.min(cost, rule.dailyMax * Math.max(1, Math.ceil(hours / 24)));
    }
    return Math.round(cost * 100) / 100;
}