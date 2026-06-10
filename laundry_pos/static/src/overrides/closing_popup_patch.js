/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";

/**
 * Cash-control accountability on closing:
 *  - The counted cash can only come from the itemized money-details count (the
 *    manual input is replaced by a read-only display, and the copy/auto-fill
 *    button is removed in the template + neutralised below).
 *  - The cash variance must be exactly zero (hard block) and the cashier must
 *    tick an accountability checkbox before "Close Register" is enabled.
 */
patch(ClosePosPopup.prototype, {
    setup() {
        super.setup();
        this.state.laundryConfirmed = false;
    },

    // Copying the expected amount into the count is disabled — the cashier must
    // count the drawer by denomination via the money-details popup.
    autoFillCashCount() {
        return;
    },

    // Block closing until counts are valid (core), the accountability box is
    // ticked, and the cash variance is exactly zero.
    canConfirm() {
        if (!this.pos.config.cash_control) {
            return super.canConfirm();
        }
        const cashDiff = this.getDifference(this.props.default_cash_details.id);
        return (
            super.canConfirm() &&
            this.state.laundryConfirmed &&
            this.pos.currency.isZero(cashDiff)
        );
    },
});
