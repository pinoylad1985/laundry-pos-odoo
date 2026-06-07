/** @odoo-module **/

// The 4 laundry service products shown in the New Order modal's service menu.
// Each maps (by name) to exactly ONE live POS product.template — the modal reads
// the real product records from pos.models, so attributes/variants/price always
// reflect whatever is configured in POS. Matching uses a LEADING word boundary
// (see _matchProduct) so "press" never matches "(express)" items.
export const LAUNDRY_MENU = [
    { code: "wdf",   label: "Wash-Dry-Fold", match: "wash-dry-fold" },
    { code: "dwc",   label: "Dry/Wet Clean", match: "dry/wet clean" },
    { code: "shoe",  label: "Shoe Clean",    match: "shoe clean" },
    { code: "press", label: "Press",         match: "press" },
];

// Service codes treated as "long turnaround" — affects schedule thresholds.
export const LONG_SERVICE_CODES = ["dwc", "shoe"];
