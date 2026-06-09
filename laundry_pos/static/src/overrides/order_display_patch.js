/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderDisplay } from "@point_of_sale/app/components/order_display/order_display";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";

// Fixed display order for the main services; everything else falls after them.
const RANK = { wdf: 1, press: 2, dwc: 3, shoe: 4 };

patch(OrderDisplay.prototype, {
    // Show the main services in a fixed order (Wash-Dry-Fold, Press, Dry/Wet
    // Clean, Shoe Clean) then the rest, regardless of the order lines were added.
    // Used by both the cart and the receipt, so both stay consistent.
    get comboSortedLines() {
        const lines = super.comboSortedLines;
        const rank = (line) => RANK[laundryCodeForProduct(line.product_id?.product_tmpl_id)] || 99;
        return [...lines]
            .map((line, i) => ({ line, i }))
            .sort((a, b) => rank(a.line) - rank(b.line) || a.i - b.i) // stable
            .map((x) => x.line);
    },
});
