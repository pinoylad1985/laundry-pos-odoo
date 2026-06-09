/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";

patch(PosOrderline.prototype, {
    // Wash-Dry-Fold / Dry-Wet Clean / Shoe Clean are one item per line, so their
    // quantity is locked at 1. Press may have qty > 1.
    setQuantity(quantity, keep_price) {
        const code = laundryCodeForProduct(this.product_id?.product_tmpl_id);
        if (code && code !== "press") {
            const q = parseFloat(quantity);
            if (!isNaN(q) && q > 1) {
                quantity = 1;
            }
        }
        return super.setQuantity(quantity, keep_price);
    },
});
