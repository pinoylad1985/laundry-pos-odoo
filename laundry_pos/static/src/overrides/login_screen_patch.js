/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { LoginScreen } from "@point_of_sale/app/screens/login_screen/login_screen";

patch(LoginScreen.prototype, {
    /**
     * On UNLOCK (re-login while the register is already open) re-open the action
     * hub. The initial session-start login runs BEFORE the register is opened
     * (session.state !== "opened"), so it is skipped here — that path is handled
     * by the opening-control popup instead.
     *
     * We both set the flag (if ProductScreen re-mounts) AND fire the event after a
     * tick (if it stayed mounted under the lock screen). _openActionHub guards
     * against opening twice.
     */
    cashierLogIn() {
        const wasOpen = this.pos.session?.state === "opened";
        const res = super.cashierLogIn(...arguments);
        if (wasOpen) {
            this.pos._pendingActionHub = true;
            setTimeout(() => document.dispatchEvent(new CustomEvent("laundry-open-hub")), 150);
        }
        return res;
    },
});
