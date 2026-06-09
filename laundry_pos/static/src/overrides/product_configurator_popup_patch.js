/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";

function isTurnaround(attrLine) {
    return String(attrLine?.attribute_id?.name || "").startsWith("Turnaround");
}

patch(ProductConfiguratorPopup.prototype, {
    // Hide turnaround attributes from the configurator — they are driven by the
    // order's schedule (TAT), not picked per product. The line's turnaround is
    // applied from the TAT after the configurator closes (see order_summary_patch).
    get validAttributeLineIds() {
        return super.validAttributeLineIds.filter((a) => !isTurnaround(a));
    },

    // True when this product actually has a turnaround attribute (drives the note).
    get hasLaundryTurnaround() {
        return super.validAttributeLineIds.some((a) => isTurnaround(a));
    },
});
