/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Navbar } from "@point_of_sale/app/components/navbar/navbar";

patch(Navbar.prototype, {
    /**
     * Fire a laundry action (new_order | settle | list). ProductScreen owns the
     * routing, so if we're on another screen we hop to ProductScreen first, then
     * dispatch once it has had a tick to mount its listener.
     */
    laundryAction(action) {
        const fire = () =>
            document.dispatchEvent(new CustomEvent("laundry-action", { detail: { action } }));
        // If we're on another screen, hop to ProductScreen first (it owns the
        // dialogs), then dispatch once it has had a tick to mount its listener.
        if (this.pos.router.state.current !== "ProductScreen") {
            const order = this.pos.getOrder() || this.pos.addNewOrder();
            this.pos.navigate("ProductScreen", { orderUuid: order.uuid });
            setTimeout(fire, 50);
            return;
        }
        fire();
    },

    // Highlight the navbar button matching the current order / screen.
    get laundryActiveSell() {
        return !!this.pos.getOrder()?.laundry_service_type;
    },
    get laundryActiveSettle() {
        const order = this.pos.getOrder();
        if (!order) {
            return false;
        }
        if (order.is_settling_account) {
            return true;
        }
        return (order.lines || []).some((l) => l.settled_order_id || l.settled_invoice_id);
    },
    get laundryActiveList() {
        return this.pos.router.state.current === "TicketScreen";
    },
});
