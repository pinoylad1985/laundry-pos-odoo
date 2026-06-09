/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";

function isTurnaround(attrLine) {
    return String(attrLine?.attribute_id?.name || "").startsWith("Turnaround");
}

patch(ProductConfiguratorPopup.prototype, {
    setup() {
        super.setup();
        this._laundryPreselectTat();
    },

    // Pre-select the turnaround value matching the order's TAT so the (greyed)
    // turnaround attribute reflects the schedule rather than a default.
    _laundryPreselectTat() {
        const tat = this.pos?.getOrder?.()?.laundry_turnaround;
        if (!tat) return;
        for (const line of this.props.productTemplate?.attribute_line_ids || []) {
            if (!isTurnaround(line)) continue;
            const vals = line.product_template_value_ids || [];
            const match = vals.find(
                (v) => String(v.name || "").toLowerCase().includes("express") === (tat === "express")
            );
            const attrId = line.attribute_id?.id;
            if (match && this.state?.attributes?.[attrId]) {
                this.state.attributes[attrId].selected = match;
            }
        }
    },

    // Used by the template to grey out / lock the turnaround attribute.
    isTurnaroundAttr(attrLine) {
        return isTurnaround(attrLine);
    },

    // True when this product has a turnaround attribute (drives the note).
    get hasLaundryTurnaround() {
        return this.validAttributeLineIds.some((a) => isTurnaround(a));
    },
});
