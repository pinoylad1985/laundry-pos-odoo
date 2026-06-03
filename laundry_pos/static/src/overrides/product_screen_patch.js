/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NewOrderModal } from "@laundry_pos/new_order_modal/new_order_modal";
import { lsSave, lsLoad } from "@laundry_pos/utils/laundry_storage";
import { useState, useEffect, onMounted, onWillUnmount } from "@odoo/owl";

const SERVICE_LABELS = {
    dropoff: "Drop-off",
    dropoff_delivery: "Drop-off & Delivery",
    pickup_delivery: "Pickup & Delivery",
    locker: "Locker",
    self_service: "Self-service",
};

patch(ProductScreen.prototype, {
    setup() {
        super.setup();

        // mode: 'idle' | 'submitted' | 'skipped'
        this.laundryState = useState({ mode: "idle", flash: false, turnaround: null });

        // Sync banner mode when switching orders or returning to POS
        useEffect(
            () => {
                const order = this.pos.getOrder();
                const stored = lsLoad(order?.uuid);

                // Rehydrate JS-only fields from localStorage after a reload
                // (laundry_* props are not synced to the server, so they vanish).
                if (stored?.status === "submitted" && !order?.laundry_service_type && order) {
                    order.laundry_service_type  = stored.serviceType;
                    order.laundry_customer_type = stored.customerType;
                    order.laundry_services      = stored.services  || [];
                    order.laundry_schedule      = stored.schedule  || {};
                    order.laundry_turnaround    = stored.turnaround || null;
                }

                if (order?.laundry_service_type) {
                    this.laundryState.mode = "submitted";
                    this.laundryState.turnaround = stored?.turnaround || order?.laundry_turnaround || null;
                } else if (stored?.status === "skipped" || order?._laundrySetupProcessed) {
                    this.laundryState.mode = "skipped";
                    this.laundryState.turnaround = null;
                } else {
                    this.laundryState.mode = "idle";
                    this.laundryState.turnaround = null;
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

        // Listen for flash signal fired by PosStore when Customer button is blocked
        onMounted(() => {
            this._laundryFlashHandler = () => this._flashBanner();
            document.addEventListener("laundry-flash-needed", this._laundryFlashHandler);
        });
        onWillUnmount(() => {
            document.removeEventListener("laundry-flash-needed", this._laundryFlashHandler);
        });
    },

    _flashBanner() {
        this.laundryState.flash = true;
        setTimeout(() => { this.laundryState.flash = false; }, 600);
    },

    _getLaundryServiceLabel() {
        const order = this.pos.getOrder();
        return SERVICE_LABELS[order?.laundry_service_type] || "";
    },

    _getLaundryCustomerLabel() {
        const order = this.pos.getOrder();
        if (order?.partner_id?.name) return order.partner_id.name;
        if (order?.laundry_customer_type === "new") return "New Customer";
        if (order?.laundry_customer_type === "returning") return "Returning Customer";
        return "";
    },

    _getLaundryTurnaroundLabel() {
        const t = this.laundryState.turnaround;
        if (t === "express") return "⚡ Express";
        if (t === "regular") return "🕐 Regular";
        return "";
    },

    _getLaundryTurnaroundType() {
        return this.laundryState.turnaround || "";
    },

    /**
     * @param {object} order
     * @param {boolean} isChange - when true, skipping keeps the existing setup intact
     */
    async _showLaundrySetupModal(order, isChange) {
        if (order) order._laundrySetupProcessed = true;

        // Pre-populate modal with any previously saved details — whether the
        // order was fully submitted OR skipped with partial selections.
        const stored = lsLoad(order?.uuid);
        const initData = (stored && (stored.serviceType || stored.customerType ||
                          (stored.services || []).length)) ? stored : null;

        const result = await makeAwaitable(this.dialog, NewOrderModal, {
            initialData: initData || undefined,
        });

        // Explicit "Skip for now" — save whatever was selected for later editing
        if (result?.skipped) {
            this.laundryState.mode = "skipped";
            this.laundryState.turnaround = null;
            lsSave(order?.uuid, {
                status:       "skipped",
                serviceType:  result.serviceType  || null,
                customerType: result.customerType || null,
                services:     result.services     || [],
                schedule:     result.schedule     || {},
                turnaround:   result.turnaround   || null,
            });
            // Keep any customer the cashier already picked
            if (result.partner) {
                this.pos.setPartnerToCurrentOrder(result.partner);
            }
            return;
        }

        // Closed via X / escape (no payload) — keep existing setup on Change,
        // otherwise mark as skipped with nothing saved.
        if (!result) {
            if (!isChange) {
                this.laundryState.mode = "skipped";
                this.laundryState.turnaround = null;
                lsSave(order?.uuid, { status: "skipped" });
            }
            return;
        }

        this.laundryState.mode = "submitted";
        this.laundryState.turnaround = result.turnaround;

        order.laundry_service_type  = result.serviceType;
        order.laundry_customer_type = result.customerType;
        order.laundry_services      = result.services  || [];
        order.laundry_schedule      = result.schedule  || {};
        order.laundry_turnaround    = result.turnaround || null;

        // Persist all details so they survive reload and pre-populate the Change modal
        lsSave(order?.uuid, {
            status:       "submitted",
            serviceType:  result.serviceType,
            customerType: result.customerType,
            services:     result.services  || [],
            schedule:     result.schedule  || {},
            turnaround:   result.turnaround || null,
        });

        if (result.editPartner) {
            await this.pos.selectPartner(order);
        } else if (result.partner) {
            this.pos.setPartnerToCurrentOrder(result.partner);
        }
    },

    // Flash the banner instead of adding the product when setup is skipped
    addProductToOrder(product) {
        const order = this.pos.getOrder();
        const stored = lsLoad(order?.uuid);
        if (
            (order?._laundrySetupProcessed || stored?.status === "skipped") &&
            !order?.laundry_service_type
        ) {
            this._flashBanner();
            return;
        }
        return super.addProductToOrder(product);
    },
});
