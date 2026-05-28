/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NewOrderModal } from "@laundry_pos/new_order_modal/new_order_modal";
import { useEffect } from "@odoo/owl";

patch(ProductScreen.prototype, {
    setup() {
        // Run the original ProductScreen setup first (sets this.pos, this.dialog, etc.)
        super.setup();

        // useEffect fires on mount AND whenever the current order's UUID changes,
        // so it covers both "first open" and "switching to a new order".
        useEffect(
            () => {
                const order = this.pos.getOrder();
                if (order?._needsLaundrySetup) {
                    order._needsLaundrySetup = false; // clear flag immediately to prevent re-trigger
                    this._showLaundrySetupModal(order);
                }
            },
            () => [this.pos.getOrder()?.uuid]
        );
    },

    /**
     * Show the New Order modal and apply the collected data to the order.
     * Customer selection is opened automatically after the modal.
     */
    async _showLaundrySetupModal(order) {
        const result = await makeAwaitable(this.dialog, NewOrderModal, {});

        if (result) {
            // Write service/customer type directly onto the order object.
            // These fields are declared in _load_pos_data_fields on pos.order,
            // so they will be included in the next sync_from_ui call.
            order.laundry_service_type = result.serviceType;
            order.laundry_customer_type = result.customerType;

            // Open customer search or creation based on type
            if (result.customerType) {
                await this.pos.selectPartner(order);
            }
        }
    },
});
