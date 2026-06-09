/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { lsDelete } from "@laundry_pos/utils/laundry_storage";
import { lineNeedsConfig, laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";

patch(PosStore.prototype, {
    /**
     * Flag the newly created order so ProductScreen can show the laundry
     * setup modal after navigation completes.
     * NOTE: We do NOT make this async — doing so breaks the URL routing
     * (order.uuid becomes undefined before navigation fires).
     */
    addNewOrder(data = {}) {
        const order = super.addNewOrder(data);
        if (order) {
            order._needsLaundrySetup = true;
        }
        return order;
    },

    /**
     * Block the Customer button when laundry setup was skipped.
     * Fires a DOM event so ProductScreen can flash the banner.
     * _needsLaundrySetup is explicitly set to false (not undefined) only after
     * the modal is shown, so existing orders without a service type are unaffected.
     */
    selectPartner(currentOrder = this.getOrder()) {
        if (currentOrder?._needsLaundrySetup === false && !currentOrder?.laundry_service_type) {
            document.dispatchEvent(new CustomEvent("laundry-flash-needed"));
            return false;
        }
        return super.selectPartner(currentOrder);
    },

    /**
     * When an order is cancelled/deleted, drop its saved laundry details so
     * stale data can't resurface if a future order reuses the same UUID.
     * removeOrder is the foundational single-order removal that all
     * deletion/cancellation flows funnel through.
     */
    removeOrder(order, removeFromServer = true) {
        lsDelete(order?.uuid);
        return super.removeOrder(order, removeFromServer);
    },

    /**
     * Laundry products must never merge into an existing line — each pill press
     * (and each configured line) is a distinct item, even when two lines are
     * identical. Forcing merge=false here keeps automatic pricing intact (unlike
     * the price_unit trick, which would pin a manual price).
     */
    tryMergeOrderline(order, line, merge, selectedOrderline) {
        const code = laundryCodeForProduct(line?.product_id?.product_tmpl_id);
        // WDF / DWC / Shoe stay as distinct qty-1 lines; Press may merge (qty > 1).
        if (code && code !== "press") {
            merge = false;
        }
        return super.tryMergeOrderline(order, line, merge, selectedOrderline);
    },

    /**
     * Block going to payment while any laundry product line still has its
     * variants/attributes unselected. Both Pay buttons funnel through pos.pay().
     */
    async pay() {
        const order = this.getOrder();
        const missing = (order?.lines || []).filter((l) => lineNeedsConfig(l));
        if (missing.length) {
            const names = [
                ...new Set(
                    missing.map((l) => l.product_id?.product_tmpl_id?.name).filter(Boolean)
                ),
            ].join(", ");
            const dialog = this.dialog || this.env?.services?.dialog;
            dialog?.add(AlertDialog, {
                title: "Select product options",
                body: `Please choose options for these products before payment: ${names}`,
            });
            return;
        }
        return super.pay(...arguments);
    },
});
