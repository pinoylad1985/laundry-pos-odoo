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

        vals.laundryAttributes = (line.attribute_value_ids || [])
            .map((av) => ({
                name: this._laundryAttrName(av.attribute_id?.name || ""),
                value: av.name || "",
            }))
            // Turnaround is already shown once in the order details header, so
            // drop the per-product "Turnaround" line from the printed receipt.
            .filter((a) => !(vals.isReceipt && a.name === "Turnaround"));

        const code = laundryCodeForProduct(line.product_id?.product_tmpl_id);
        if (code && typeof vals.name === "string") {
            vals.name = vals.name.replace(/\s*\([^()]*\)\s*$/, "").trim();
        }
        // WDF/Press get write-in count lines on the receipt (Sorting at the top;
        // Folding for WDF / Press count for Press at the bottom).
        vals.laundryWdf = code === "wdf";
        vals.laundryPress = code === "press";
        return vals;
    },

    // "Turnaround (Press)" / "Turnaround Time" → "Turnaround"
    _laundryAttrName(name) {
        return name.startsWith("Turnaround") ? "Turnaround" : name;
    },
});
