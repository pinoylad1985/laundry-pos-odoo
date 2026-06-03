/** @odoo-module **/

// Per-service instruction fields shown in the expandable panel under each
// selected service. Mirrors the "basic details" from the public booking page.
//
// Each field:
//   key:     state key within instructions[serviceCode]
//   label:   shown to the cashier
//   attr:    Odoo product.attribute name to match for variant pre-selection,
//            or null for info-only fields (saved as a note, no variant).
//   type:    "pills" (default, single-select) or "text"
//   options: [{ value, label }]  (value is matched against the Odoo
//            product.attribute.value name for variant pre-selection)
export const SERVICE_INSTRUCTIONS = {
    wdf: [
        {
            key: "soil", label: "Soiled Level", attr: "Soil Level",
            options: [
                { value: "Light",  label: "Light" },
                { value: "Medium", label: "Medium (+₱5/kg)" },
                { value: "Heavy",  label: "Heavy (+₱10/kg)" },
            ],
        },
        {
            key: "load", label: "Load Type", attr: null,
            options: [
                { value: "Combined",       label: "Combined (6-7kg min)" },
                { value: "White Separate", label: "White Separate (4kg min)" },
                { value: "Per Bag",        label: "Per Bag (4kg min)" },
            ],
        },
        {
            key: "stain", label: "Stain Treatment", attr: null,
            options: [
                { value: "N/A",       label: "N/A" },
                { value: "Quick",     label: "Quick (₱50/item min)" },
                { value: "Overnight", label: "Overnight (₱100/item min)" },
            ],
        },
        {
            key: "dry", label: "Drying Method", attr: null,
            options: [
                { value: "High Heat",   label: "High Heat" },
                { value: "Medium Heat", label: "Medium Heat" },
                { value: "Low Heat",    label: "Low Heat" },
                { value: "Hang Dry",    label: "Hang Dry" },
            ],
        },
        {
            key: "fold", label: "Folding Type", attr: null,
            options: [
                { value: "Regular",   label: "Regular" },
                { value: "Fast Fold", label: "Fast Fold" },
            ],
        },
    ],
    dwc: [
        {
            key: "item", label: "Item", attr: "Item",
            options: [
                "Big Gown", "Long Dress", "Long Coat", "Suit/Blazer", "Jacket",
                "Barong", "Long Sleeves", "Polo Shirt/T-shirt", "Vest",
                "Pants", "Shorts", "Necktie",
            ].map((n) => ({ value: n, label: n })),
        },
    ],
    press: [
        {
            key: "size", label: "Steam Size", attr: "Steam Size",
            options: [
                { value: "Small", label: "Small" },
                { value: "Large", label: "Large" },
            ],
        },
        {
            key: "hanger", label: "Customer Provided Hanger?", attr: "Customer Provided Hanger?",
            options: [
                { value: "Yes", label: "Yes" },
                { value: "No",  label: "No" },
            ],
        },
        { key: "note", label: "Press Instructions", attr: null, type: "text" },
    ],
    shoe: [
        {
            key: "type", label: "Cleaning Level", attr: "Type",
            options: [
                { value: "Regular",    label: "Regular (₱300)" },
                { value: "Deep Clean", label: "Deep Clean (₱400)" },
            ],
        },
    ],
};

// Service code → keywords matched (case-insensitive) against POS product names.
// EVERY product whose name contains a keyword is added to the cart.
// NOTE: the Press/steam product is named "Steam" in the catalog (there is no
// product literally named "Press"), so we match both. Matching is done with a
// leading word boundary in product_screen_patch so "press" never matches the
// "(express)" bedding items.
export const SERVICE_PRODUCT_KEYWORDS = {
    wdf:   ["wash-dry-fold"],
    dwc:   ["dry/wet clean"],
    press: ["press", "steam"],
    shoe:  ["shoe clean"],
};
