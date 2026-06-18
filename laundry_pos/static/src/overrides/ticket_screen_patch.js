/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";

/**
 * LIST hub action — adds a customer search bar above the order "Search Orders"
 * bar. Picking a customer's "All Orders" filters the order list by that exact
 * customer (reusing the built-in PARTNER + partnerId search). The two search
 * bars are mutually exclusive via `mode` ('' | 'customer' | 'order'): using one
 * greys out the other.
 */
patch(TicketScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.laundryState = useState({
            customerQuery: "",
            selectedCustomer: null,
            showCustomerResults: false,
            mode: "",
            rev: 0,
        });
    },

    onLaundryCustomerInput(ev) {
        const val = ev.target.value;
        this.laundryState.customerQuery = val;
        this.laundryState.selectedCustomer = null;
        this.laundryState.showCustomerResults = !!val;
        this.laundryState.mode = val ? "customer" : "";
    },

    // Press Enter → also search the server (POS pre-loads only a subset of customers).
    onLaundryCustomerKeydown(ev) {
        if (ev.key === "Enter") {
            this._serverSearchCustomers();
        }
    },

    async _serverSearchCustomers() {
        const q = this.laundryState.customerQuery.trim();
        if (!q || this._searching) {
            return;
        }
        this._searching = true;
        try {
            const fields = ["complete_name", "phone_mobile_search", "barcode", "street", "city", "email"];
            const domain = [...Array(fields.length - 1).fill("|"), ...fields.map((f) => [f, "ilike", q])];
            await this.pos.data.callRelated("res.partner", "get_new_partner", [
                this.pos.config.id,
                domain,
                0,
            ]);
        } finally {
            this._searching = false;
            this.laundryState.rev++;
        }
    },

    get laundryCustomerResults() {
        void this.laundryState.rev; // re-run after a server search loads more customers
        const q = this.laundryState.customerQuery.trim().toLowerCase();
        if (!q) {
            return [];
        }
        const s = (v) => String(v || "").toLowerCase();
        return (this.pos.models["res.partner"].getAll() || [])
            .filter(
                (p) =>
                    s(p.name).includes(q) ||
                    s(p.phone).includes(q) ||
                    s(p.mobile).includes(q) ||
                    s(p.parent_name).includes(q) ||
                    s(p.pos_contact_address).includes(q)
            );
    },

    laundrySelectCustomer(partner) {
        this.laundryState.selectedCustomer = partner;
        this.laundryState.customerQuery = partner.name;
        this.laundryState.showCustomerResults = false;
        this.laundryState.mode = "customer";
        this.onSearch({ fieldName: "PARTNER", searchTerm: partner.name, partnerId: partner.id });
    },

    laundryClearCustomer() {
        this.laundryState.selectedCustomer = null;
        this.laundryState.customerQuery = "";
        this.laundryState.showCustomerResults = false;
        this.laundryState.mode = "";
        this.onSearch({ fieldName: "PARTNER", searchTerm: "" });
    },

    // Order search bar used (anything other than our customer-by-id filter)
    // → drop the customer selection so only one filter is ever active.
    onSearch(search) {
        if (!(search.fieldName === "PARTNER" && search.partnerId)) {
            this.laundryState.selectedCustomer = null;
            this.laundryState.customerQuery = "";
            this.laundryState.mode = search.searchTerm ? "order" : "";
        }
        return super.onSearch(search);
    },
});
