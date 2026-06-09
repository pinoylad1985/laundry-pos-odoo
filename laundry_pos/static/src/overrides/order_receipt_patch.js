/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";
import { lsLoad } from "@laundry_pos/utils/laundry_storage";

// Fixed order for the per-line transaction copies (matches order_display_patch).
const RANK = { wdf: 1, press: 2, dwc: 3, shoe: 4 };
const CUSTOMER_COPY_TYPES = ["dropoff", "dropoff_delivery", "self_service"];

patch(OrderReceipt.prototype, {
    /**
     * The list of receipt copies to render (the template repeats the whole
     * receipt once per entry):
     *   - one "i/n TRANSACTION COPY" per main-service line (that line boxed),
     *   - a "SHOP COPY" (always),
     *   - a "CUSTOMER COPY" for Drop-off / Drop-off & Delivery / Self-service.
     * Non-laundry orders get a single, normal, unlabelled copy.
     */
    get laundryCopies() {
        const order = this.props.order;
        let svcType = order?.laundry_service_type;
        if (!svcType) {
            const stored = lsLoad(order?.uuid);
            if (stored?.status === "submitted") svcType = stored.serviceType;
        }

        const codeOf = (l) => laundryCodeForProduct(l.product_id?.product_tmpl_id);
        const mainLines = (order?.lines || [])
            .filter((l) => codeOf(l))
            .map((l, i) => ({ l, i }))
            .sort((a, b) => (RANK[codeOf(a.l)] || 99) - (RANK[codeOf(b.l)] || 99) || a.i - b.i)
            .map((x) => x.l);

        if (!(mainLines.length || svcType)) {
            return [{ label: null, boxedUuid: null }]; // normal single receipt
        }

        const n = mainLines.length;
        const copies = mainLines.map((l, i) => ({
            label: `${i + 1}/${n} TRANSACTION COPY`,
            boxedUuid: l.uuid,
        }));
        copies.push({ label: "SHOP COPY", boxedUuid: null });
        if (CUSTOMER_COPY_TYPES.includes(svcType)) {
            copies.push({ label: "CUSTOMER COPY", boxedUuid: null });
        }
        return copies;
    },
});
