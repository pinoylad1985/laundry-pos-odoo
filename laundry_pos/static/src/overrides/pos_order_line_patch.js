/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";

// Wash-Dry-Fold quantity IS the (rounded) weight and must not be hand-edited via the
// numpad/typing — only the configurator's "Actual Weight" input and the minimum-weight
// auto-bump may set it. Those legitimate paths run inside this guard; the numpad does not.
let wdfQtyAllowed = false;
export async function allowWdfQty(fn) {
    const prev = wdfQtyAllowed;
    wdfQtyAllowed = true;
    try {
        return await fn();
    } finally {
        wdfQtyAllowed = prev;
    }
}

patch(PosOrderline.prototype, {
    // Dry-Wet Clean / Shoe Clean are one item per line, so their quantity is locked
    // at 1. Wash-Dry-Fold quantity = weight, set ONLY via the configurator (manual
    // numpad edits are ignored). Press may have qty > 1.
    setQuantity(quantity, keep_price) {
        const code = laundryCodeForProduct(this.product_id?.product_tmpl_id);
        if (code === "dwc" || code === "shoe") {
            const q = parseFloat(quantity);
            // Locked at 1 — the numpad can't change it (0 stays allowed so the
            // line can still be removed).
            if (!isNaN(q) && q !== 0 && q !== 1) {
                quantity = 1;
            }
        } else if (code === "wdf" && !wdfQtyAllowed) {
            const q = parseFloat(quantity);
            // Ignore manual qty edits for Wash-Dry-Fold (0 still allowed so the
            // line can be removed).
            if (!isNaN(q) && q !== 0) {
                return;
            }
        }
        return super.setQuantity(quantity, keep_price);
    },
});
