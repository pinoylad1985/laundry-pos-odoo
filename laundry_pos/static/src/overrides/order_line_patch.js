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

        // Attributes show in cart + receipt; Turnaround is dropped from the RECEIPT
        // (already in the order-details header) but kept in the cart.
        vals.laundryAttributes = (line.attribute_value_ids || [])
            .map((av) => ({
                name: this._laundryAttrName(av.attribute_id?.name || ""),
                value: av.name || "",
            }))
            .filter((a) => !(vals.isReceipt && a.name === "Turnaround"));

        const code = laundryCodeForProduct(line.product_id?.product_tmpl_id);
        if (code && typeof vals.name === "string") {
            vals.name = vals.name.replace(/\s*\([^()]*\)\s*$/, "").trim();
        }
        // Wash-Dry-Fold: the ACTUAL entered weight gets its own line ABOVE everything
        // (above "Sorted pcs" on the receipt). The qty/billing uses the rounded value.
        if (code === "wdf" && line.laundry_actual_weight) {
            const disp = String(Math.round(line.laundry_actual_weight * 100) / 100);
            vals.laundryActualWeight = `${disp} KG`;
        }
        // Wash-Dry-Fold: show the per-KG qty with up to ONE decimal (2.5, not 2.50).
        if (code === "wdf") {
            const rounded = Math.round((line.qty || 0) * 10) / 10;
            const [unit, dec] = String(rounded).split(".");
            const point = line.getQuantityStr().decimalPoint || ".";
            vals.unitPart = unit;
            vals.decimalPart = dec ? `${point}${dec}` : "";
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
