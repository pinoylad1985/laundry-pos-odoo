/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

// Cache the original productsToDisplay descriptor so we can call it safely
const _originalProductsToDisplay = Object.getOwnPropertyDescriptor(
    PosStore.prototype,
    "productsToDisplay"
);

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
     * Filter the product grid to only show products tagged for the
     * active order's service type. Products with no service type tags
     * are always shown (they apply to all service types).
     */
    get productsToDisplay() {
        const allProducts = _originalProductsToDisplay.get.call(this);
        const currentOrder = this.getOrder();
        const serviceType = currentOrder?.laundry_service_type;

        if (!serviceType) {
            return allProducts;
        }

        return allProducts.filter((product) => {
            const codes = product.laundry_service_type_codes;
            if (!codes) return true; // no restriction → show for all types
            return codes.split(",").includes(serviceType);
        });
    },
});
