/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { CustomSelectCreateDialog } from "@point_of_sale/app/components/custom_select_create_dialog/custom_select_create_dialog";
import { partnerMatchesQuery, buildPartnerSearchDomain } from "@laundry_pos/utils/partner_search";

/**
 * SETTLE hub action — a customer search where each row shows that customer's
 * actual settlement option (Settle orders / Settle invoices / Settle due amount /
 * Deposit money), derived from pos.getPartnerCredit. The actions reuse the real
 * pos_settle_due flows on PosStore (onClickSettleDue / onClickSettleInvoices /
 * depositMoney) — this component only re-surfaces them outside the ☰ menu.
 */
export class SettleModal extends Component {
    static template = "laundry_pos.SettleModal";
    static components = { Dialog };
    static props = { close: Function };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.state = useState({
            query: "",
            rev: 0,
            // Auto-select the order's current customer (Control Button) if any.
            selectedPartner: this.pos.getOrder()?.getPartner?.() || null,
        });
    }

    unselect() {
        this.state.selectedPartner = null;
    }

    onSearchInput(ev) {
        this.state.query = ev.target.value;
    }

    // Press Enter → also search the server (POS pre-loads only a subset of customers).
    onSearchKeydown(ev) {
        if (ev.key === "Enter") {
            this._serverSearch();
        }
    }

    async _serverSearch() {
        const q = this.state.query.trim();
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
            this.state.rev++;
        }
    }

    // Default view = customers who carry a balance (total_due != 0). Typing
    // searches across all loaded customers by name / phone / company.
    get filteredPartners() {
        void this.state.rev; // re-run after a server search loads more customers
        const q = this.state.query.trim();
        const all = this.pos.models["res.partner"]?.getAll() ?? [];
        if (!q) {
            // Default view = customers who carry a balance.
            return all.filter((p) => (p.total_due || 0) !== 0);
        }
        return all.filter((p) => partnerMatchesQuery(p, q));
    }

    credit(partner) {
        return this.pos.getPartnerCredit(partner);
    }

    fmt(amount) {
        return this.env.utils.formatCurrency(amount);
    }

    address(partner) {
        return partner.pos_contact_address || "";
    }

    // A "pay later" payment method must exist for deposit/settle-due to work.
    payLaterExists() {
        return this.pos.models["pos.payment.method"].some(
            (pm) =>
                this.pos.config.payment_method_ids.some((m) => m.id === pm.id) &&
                pm.type === "pay_later"
        );
    }

    // ── Settle actions (mirror pos_settle_due PartnerLine, via PosStore) ─────

    async settleOrders(partner) {
        this.props.close();
        const commercialPartnerId = partner.raw.commercial_partner_id;
        const matchingOrderIds = await this.pos.data.call(
            "res.partner",
            "get_matching_paylater_orders",
            [[commercialPartnerId]]
        );
        this.dialog.add(CustomSelectCreateDialog, {
            resModel: "pos.order",
            noCreate: true,
            multiSelect: true,
            listViewId: this.pos.models["ir.ui.view"].find(
                (v) => v.name == "customer_due_pos_order_list_view"
            ).id,
            domain: [
                ["commercial_partner_id", "=", commercialPartnerId],
                ["customer_due_total", "!=", false],
                ["id", "not in", matchingOrderIds],
                ["amount_total", "!=", 0],
            ],
            onSelected: (orderIds) =>
                this.pos.onClickSettleDue(orderIds, partner.id, commercialPartnerId),
        });
    }

    async settleInvoices(partner) {
        this.props.close();
        const commercialPartnerId = partner.raw.commercial_partner_id;
        this.dialog.add(CustomSelectCreateDialog, {
            resModel: "account.move",
            noCreate: true,
            multiSelect: true,
            listViewId: this.pos.models["ir.ui.view"].find(
                (v) => v.name == "due_account_move_list_view"
            ).id,
            domain: [
                ["commercial_partner_id", "=", commercialPartnerId],
                ["pos_amount_unsettled", "!=", 0],
            ],
            onSelected: (invoiceIds) =>
                this.pos.onClickSettleInvoices(invoiceIds, partner.id, commercialPartnerId),
        });
    }

    // Used for both "Settle due amount" (amount = remainingDue) and "Deposit money" (0).
    depositMoney(partner, amount = 0) {
        this.props.close();
        this.pos.depositMoney(partner, amount);
    }
}
