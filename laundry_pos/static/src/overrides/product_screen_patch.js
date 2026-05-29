/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NewOrderModal } from "@laundry_pos/new_order_modal/new_order_modal";
import { useEffect } from "@odoo/owl";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();

        useEffect(
            () => {
                const order = this.pos.getOrder();
                if (order?._needsLaundrySetup) {
                    order._needsLaundrySetup = false;
                    this._showLaundrySetupModal(order);
                }
            },
            () => [this.pos.getOrder()?.uuid]
        );
    },

    async _showLaundrySetupModal(order) {
        const result = await makeAwaitable(this.dialog, NewOrderModal, {});

        if (!result) return; // skipped

        order.laundry_service_type = result.serviceType;
        order.laundry_customer_type = result.customerType;

        if (result.editPartner) {
            // Cashier clicked "Edit Details" on a result row — open the POS partner dialog
            await this.pos.selectPartner(order);
        } else if (result.partner) {
            // Returning customer selected inline — apply directly
            this.pos.setPartnerToCurrentOrder(result.partner);
        }
        // New customer: cashier uses the Customer button below the cart as usual
    },
});
