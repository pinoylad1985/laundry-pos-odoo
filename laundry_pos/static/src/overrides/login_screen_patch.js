/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { LoginScreen } from "@point_of_sale/app/screens/login_screen/login_screen";

patch(LoginScreen.prototype, {
    /**
     * On UNLOCK (re-login while the register is already open) flag the action hub
     * so ProductScreen opens it once it re-mounts. The initial session-start login
     * runs BEFORE the register is opened (session.state !== "opened"), so it is
     * skipped here — that path is handled by the opening-control popup instead.
     */
    cashierLogIn() {
        if (this.pos.session?.state === "opened") {
            this.pos._pendingActionHub = true;
        }
        return super.cashierLogIn(...arguments);
    },
});
