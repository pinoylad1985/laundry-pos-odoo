/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";

patch(ReceiptHeader.prototype, {
    /**
     * Partner tag names for the receipt.
     *
     * Depending on how the POS deserialises the m2m, `partner.category_id` may
     * arrive as an array of category records OR as an array of raw ids. Handle
     * both: use the record's name directly, otherwise resolve the id against the
     * loaded res.partner.category model.
     */
    get laundryPartnerTags() {
        const partner = this.props.order?.partner_id;
        if (!partner || !partner.category_id) return [];
        const raw = Array.isArray(partner.category_id)
            ? partner.category_id
            : [...partner.category_id];
        const catModel =
            this.props.order.models?.["res.partner.category"] ||
            partner.models?.["res.partner.category"];
        return raw
            .map((c) => {
                if (c && typeof c === "object") return c.name;   // already a record
                const rec = catModel?.get?.(c);                  // resolve id → record
                return rec?.name;
            })
            .filter(Boolean);
    },
});
