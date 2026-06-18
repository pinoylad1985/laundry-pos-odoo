/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PartnerLine } from "@point_of_sale/app/screens/partner_list/partner_line/partner_line";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

/**
 * In the NORMAL customer picker (cart → Customer → ☰), the per-customer
 * settlement actions and "All Orders" are disabled — cashiers use the SETTLE /
 * LIST hub actions instead. We override the handlers to show a redirect hint.
 *
 * NOTE: laundry_pos depends on pos_settle_due so these patches load AFTER it,
 * letting our overrides win over pos_settle_due's settle methods.
 */
function laundryNotice(self, title, body) {
    const dialog = self.dialog || self.env?.services?.dialog;
    dialog?.add(AlertDialog, { title, body });
}

patch(PartnerLine.prototype, {
    settleCustomerDue() {
        laundryNotice(this, "Settle", "Use Settle function");
    },
    settleCustomerInvoices() {
        laundryNotice(this, "Settle", "Use Settle function");
    },
    depositMoney() {
        laundryNotice(this, "Settle", "Use Settle function");
    },
});

patch(PartnerList.prototype, {
    goToOrders() {
        laundryNotice(this, "All Orders", "Use List function");
    },
});
