/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";

patch(Orderline.prototype, {
    // Expose the line's attributes as { name, value } pairs (one per line, with a
    // header), normalise the Turnaround header to just "Turnaround", and strip the
    // duplicated "(Variant)" suffix from a laundry product's display name.
    get lineScreenValues() {
        const vals = super.lineScreenValues;
        const line = this.props.line;

        vals.laundryAttributes = (line.attribute_value_ids || []).map((av) => ({
            name: this._laundryAttrName(av.attribute_id?.name || ""),
            value: av.name || "",
        }));

        if (
            laundryCodeForProduct(line.product_id?.product_tmpl_id) &&
            typeof vals.name === "string"
        ) {
            vals.name = vals.name.replace(/\s*\([^()]*\)\s*$/, "").trim();
        }
        return vals;
    },

    // "Turnaround (Press)" / "Turnaround Time" → "Turnaround"
    _laundryAttrName(name) {
        return name.startsWith("Turnaround") ? "Turnaround" : name;
    },
});
