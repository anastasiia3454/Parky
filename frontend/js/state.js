// Gemeinsamer Zustand. Als Objekt exportiert, weil Module importierte
// Variablen nicht neu zuweisen dürfen (state.x = ... funktioniert).

export const state = {
    // Wird bei jeder neuen Suche und beim Zurücksetzen erhöht.
    // Alte Suchen verwerfen dann ihre Ergebnisse.
    searchSession: 0,

    // Direktfahrt mit dem Auto (vom Backend oder OSRM-Fallback)
    directCarRoute: null
};