/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NewOrderModal } from "@laundry_pos/new_order_modal/new_order_modal";

// Cache the original productsToDisplay descriptor so we can call it from the patch
const _originalProductsToDisplay = Object.getOwnPropertyDescriptor(
    PosStore.prototype,
    "productsToDisplay"
);

patch(PosStore.prototype, {
    /**
     * Intercept new order creation to show the laundry setup modal.
     * The modal collects Customer Type and Service Type before the
     * POS product screen becomes interactive.
     */
    async addNewOrder(data = {}) {
        const result = await makeAwaitable(this.dialog, NewOrderModal, {});

        const order = await super.addNewOrder({
            ...data,
            laundry_service_type: result?.serviceType || false,
            laundry_customer_type: result?.customerType || false,
        });

        // After the modal, immediately open customer search/creation
        if (result?.customerType) {
            await this.selectPartner(order);
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
