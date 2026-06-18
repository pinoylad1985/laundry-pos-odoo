/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { partnerMatchesQuery, buildPartnerSearchDomain } from "@laundry_pos/utils/partner_search";

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
            await this.pos.data.callRelated("res.partner", "get_new_partner", [
                this.pos.config.id,
                buildPartnerSearchDomain(q),
                0,
            ]);
        } finally {
            this._searching = false;
            this.laundryState.rev++;
        }
    },

    get laundryCustomerResults() {
        void this.laundryState.rev; // re-run after a server search loads more customers
        const q = this.laundryState.customerQuery.trim();
        if (!q) {
            return [];
        }
        return (this.pos.models["res.partner"].getAll() || []).filter((p) => partnerMatchesQuery(p, q));
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
