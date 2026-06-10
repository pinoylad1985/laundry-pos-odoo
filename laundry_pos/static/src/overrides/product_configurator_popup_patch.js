/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";

function isTurnaround(attrLine) {
    return String(attrLine?.attribute_id?.name || "").startsWith("Turnaround");
}

// PTAV ids of the line currently being re-configured, so the configurator opens
// pre-filled with what was previously selected (set by order_summary_patch).
let editSelectionIds = null;
export function setEditSelection(ids) {
    editSelectionIds = ids && ids.length ? ids : null;
}

patch(ProductConfiguratorPopup.prototype, {
    setup() {
        super.setup();
        this._laundryPreselectEdit(); // restore the line's previous choices
        this._laundryPreselectTat(); // turnaround follows the order's TAT
    },

    /**
     * Guard against a core crash: setup() seeds `state.attributes` keyed by each
     * attribute LINE's attribute_id, but initAttributes() then sets `.selected`
     * on `state.attributes[value.attribute_id.id]` — keyed by each VALUE's
     * attribute_id. If a product has a value whose attribute_id isn't one of the
     * line keys (a malformed/mismigrated product, e.g. after a DB restore), core
     * throws "Cannot set properties of undefined (setting 'selected')". We
     * pre-create a state entry for every value's attribute_id first, so the
     * assignment always lands somewhere instead of crashing the whole popup.
     */
    initAttributes() {
        for (const line of this.props.productTemplate?.attribute_line_ids || []) {
            for (const value of line.product_template_value_ids || []) {
                const attrId = value.attribute_id?.id;
                if (attrId != null && !this.state.attributes[attrId]) {
                    this.state.attributes[attrId] = { selected: [], custom_value: "" };
                }
            }
        }
        return super.initAttributes(...arguments);
    },

    // Pre-select each attribute value the line already has, so re-opening the
    // configurator shows the previous selection rather than a blank form.
    _laundryPreselectEdit() {
        if (!editSelectionIds) {
            return;
        }
        for (const line of this.props.productTemplate?.attribute_line_ids || []) {
            const attrId = line.attribute_id?.id;
            const match = (line.product_template_value_ids || []).find((v) =>
                editSelectionIds.includes(v.id)
            );
            if (match && this.state?.attributes?.[attrId]) {
                this.state.attributes[attrId].selected = match;
            }
        }
    },

    // Pre-select the turnaround value matching the order's TAT (locked anyway).
    _laundryPreselectTat() {
        const tat = this.pos?.getOrder?.()?.laundry_turnaround;
        if (!tat) {
            return;
        }
        for (const line of this.props.productTemplate?.attribute_line_ids || []) {
            if (!isTurnaround(line)) {
                continue;
            }
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
