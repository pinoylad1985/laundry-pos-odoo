/** @odoo-module **/

// Persistent per-order laundry details, keyed by order UUID.
// Survives POS reload / module re-entry (laundry_* props are JS-only and not
// synced to the server, so they would otherwise vanish on rebuild).
// Store shape: { [uuid]: { status: 'skipped' | 'submitted', ...details } }
const LS_KEY = "laundry_pos_orders";

export function lsSave(uuid, data) {
    if (!uuid) return;
    try {
        const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
        all[uuid] = data;
        // Rotate out oldest entries when the store grows large
        const keys = Object.keys(all);
        if (keys.length > 100) delete all[keys[0]];
        localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch {}
}

export function lsLoad(uuid) {
    if (!uuid) return null;
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || "{}")[uuid] || null;
    } catch {}
    return null;
}

export function lsDelete(uuid) {
    if (!uuid) return;
    try {
        const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
        delete all[uuid];
        localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch {}
}
