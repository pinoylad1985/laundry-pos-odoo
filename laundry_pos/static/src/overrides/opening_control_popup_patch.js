/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OpeningControlPopup } from "@point_of_sale/app/components/popups/opening_control_popup/opening_control_popup";

/**
 * Cash-control accountability on opening:
 *  - The opening amount can only come from the itemized money-details count
 *    (the manual input is replaced by a read-only display in the template), so
 *    we blank the pre-filled balance to force a fresh count.
 *  - The counted total must MATCH the previous session's closing counted cash
 *    (pos.session.cash_register_balance_start, which Odoo carries forward) —
 *    over/short must be exactly zero.
 *  - The cashier must tick an accountability checkbox.
 * Only then is "Open Register" enabled (see opening_control_popup.xml).
 */
patch(OpeningControlPopup.prototype, {
    setup() {
        super.setup();
        this.state.laundryConfirmed = false;
        if (this.cashMethodCount) {
            // Don't pre-fill with the expected amount — require a real count.
            this.state.openingCash = "";
        }
    },

    // Expected opening = previous session's closing counted cash (carried forward).
    get expectedOpening() {
        return this.pos.session.cash_register_balance_start || 0;
    },

    get openingCounted() {
        return this.env.utils.parseValidFloat(this.state.openingCash || "0");
    },

    get openingDifference() {
        return this.openingCounted - this.expectedOpening;
    },

    get openingZeroVariance() {
        return this.pos.currency.isZero(this.openingDifference);
    },

    // Gate for the "Open Register" button.
    get canLaundryOpen() {
        // No cash method on this config → nothing to count; keep core behaviour.
        if (!this.cashMethodCount) {
            return this.env.utils.isValidFloat(this.state.openingCash);
        }
        // The amount is only settable via the count modal, so a valid float here
        // already proves a count happened.
        return (
            this.env.utils.isValidFloat(this.state.openingCash) &&
            this.openingZeroVariance &&
            this.state.laundryConfirmed
        );
    },
});
