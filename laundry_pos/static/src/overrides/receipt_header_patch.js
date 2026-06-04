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
        // Preloaded partners expose category_id as category records; partners
        // fetched on-demand (cashier search) expose them as raw ids — resolve
        // those against the loaded res.partner.category model. Use the pos
        // service registry, which is the reliable place to reach the models.
        const catModel = this.env?.services?.pos?.models?.["res.partner.category"];
        return raw
            .map((c) => {
                if (c && typeof c === "object") return c.name;   // already a record
                const rec = catModel?.get?.(c);                  // resolve id → record
                return rec?.name;
            })
            .filter(Boolean);
    },
});
