/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

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
});
