/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NewOrderModal } from "@laundry_pos/new_order_modal/new_order_modal";
import { LaundryOrderBanner } from "@laundry_pos/laundry_order_banner/laundry_order_banner";
import { useState, useEffect } from "@odoo/owl";

// Register banner so the template extension can use it
ProductScreen.components = { ...ProductScreen.components, LaundryOrderBanner };

patch(ProductScreen.prototype, {
    setup() {
        super.setup();

        // mode: 'idle' | 'submitted' | 'skipped'
        // flash: true for one render cycle to animate the banner
        this.laundryState = useState({ mode: "idle", flash: false });

        // Sync banner mode when switching between orders
        useEffect(
            () => {
                const order = this.pos.getOrder();
                if (order?.laundry_service_type) {
                    this.laundryState.mode = "submitted";
                } else {
                    this.laundryState.mode = "idle";
                }
            },
            () => [this.pos.getOrder()?.uuid]
        );

        // Show modal for freshly created orders
        useEffect(
            () => {
                const order = this.pos.getOrder();
                if (order?._needsLaundrySetup) {
                    order._needsLaundrySetup = false;
                    this._showLaundrySetupModal(order, false);
                }
            },
            () => [this.pos.getOrder()?.uuid]
        );

        // Listen for flash signal fired by PosStore when the Customer button is blocked
        useEffect(
            () => {
                const handler = () => this._flashBanner();
                document.addEventListener("laundry-flash-needed", handler);
                return () => document.removeEventListener("laundry-flash-needed", handler);
            },
            () => []
        );
    },

    _flashBanner() {
        this.laundryState.flash = true;
        setTimeout(() => { this.laundryState.flash = false; }, 600);
    },

    /**
     * @param {object} order
     * @param {boolean} isChange - when true, skipping keeps the existing setup
     */
    async _showLaundrySetupModal(order, isChange) {
        const result = await makeAwaitable(this.dialog, NewOrderModal, {});

        if (!result) {
            if (!isChange) {
                this.laundryState.mode = "skipped";
            }
            return;
        }

        this.laundryState.mode = "submitted";
        order.laundry_service_type = result.serviceType;
        order.laundry_customer_type = result.customerType;

        if (result.editPartner) {
            await this.pos.selectPartner(order);
        } else if (result.partner) {
            this.pos.setPartnerToCurrentOrder(result.partner);
        }
    },

    // Flash the banner instead of re-opening the modal or adding the product
    addProductToOrder(product) {
        const order = this.pos.getOrder();
        if (order?._needsLaundrySetup === false && !order?.laundry_service_type) {
            this._flashBanner();
            return;
        }
        return super.addProductToOrder(product);
    },
});
