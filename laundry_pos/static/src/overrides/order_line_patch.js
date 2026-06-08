/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

patch(Orderline.prototype, {
    // Expose the line's attributes as { name, value } pairs so the template can
    // render them one per line with a header (e.g. "Turnaround: Express") instead
    // of the default inline value-only string.
    get lineScreenValues() {
        const vals = super.lineScreenValues;
        const line = this.props.line;
        vals.laundryAttributes = (line.attribute_value_ids || []).map((av) => ({
            name: av.attribute_id?.name || "",
            value: av.name || "",
        }));
        return vals;
    },
});
