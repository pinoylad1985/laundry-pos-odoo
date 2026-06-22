/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { lsDelete } from "@laundry_pos/utils/laundry_storage";
import { lineNeedsConfig, laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";
import { computeLaundryCopies, setPrintOnlyCopy } from "@laundry_pos/overrides/order_receipt_patch";

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
     * Keep the Order List (TicketScreen) independent of the Customer control
     * button. The core seeds the order search with the current order's partner
     * name, which auto-filters the list by whoever is on the order. We always
     * open the Order List unfiltered so the two selections stay independent.
     */
    getDefaultSearchDetails() {
        return { fieldName: "RECEIPT_NUMBER", searchTerm: "" };
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
     * Print one job per laundry copy (TRANSACTION/SHOP/CUSTOMER) so the thermal
     * printer cuts between each. Non-laundry orders print once, normally.
     */
    async printReceipt(opts = {}) {
        const order = opts.order || this.getOrder();
        const copies = computeLaundryCopies(order);
        if (!(copies.length && copies[0]?.label)) {
            return super.printReceipt(opts); // not a laundry order — single receipt
        }
        let result;
        for (const copy of copies) {
            setPrintOnlyCopy(copy);
            try {
                result = await super.printReceipt({ ...opts, order });
            } finally {
                setPrintOnlyCopy(null);
            }
        }
        return result;
    },

    // Every tap creates a NEW line — products never merge into an existing line
    // (consistent for all products). Quantity is changed via the numpad instead.
    tryMergeOrderline(order, line, merge, selectedOrderline) {
        return super.tryMergeOrderline(order, line, false, selectedOrderline);
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

        // Wash-Dry-Fold is charged per KG: at least 6KG for a single WDF line,
        // or 4KG on each line when there is more than one WDF line.
        const wdfLines = (order?.lines || []).filter(
            (l) => laundryCodeForProduct(l.product_id?.product_tmpl_id) === "wdf"
        );
        if (wdfLines.length) {
            const minKg = wdfLines.length === 1 ? 6 : 4;
            if (wdfLines.some((l) => (l.qty || 0) < minKg)) {
                const dialog = this.dialog || this.env?.services?.dialog;
                dialog?.add(AlertDialog, {
                    title: "Minimum Wash-Dry-Fold weight",
                    body:
                        wdfLines.length === 1
                            ? "Wash-Dry-Fold requires at least 6KG."
                            : `Each Wash-Dry-Fold line requires at least 4KG (you have ${wdfLines.length} lines).`,
                });
                return;
            }
        }
        return super.pay(...arguments);
    },
});
