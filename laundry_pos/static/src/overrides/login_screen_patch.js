/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";
import { LoginScreen } from "@point_of_sale/app/screens/login_screen/login_screen";

patch(LoginScreen.prototype, {
    /**
     * Mark that we passed through the lock/login screen. When ProductScreen next
     * mounts with the register already open, it re-opens the action hub (see
     * product_screen_patch). Hooking the screen mount (not a specific login
     * method) makes this work with OR without pos_hr employee login.
     */
    setup() {
        super.setup(...arguments);
        onMounted(() => {
            this.pos._cameFromLock = true;
        });
    },
});
