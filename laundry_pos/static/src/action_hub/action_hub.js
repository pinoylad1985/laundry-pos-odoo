/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * The cashier "action launcher" shown when the register is opened or unlocked.
 * Three choices — NEW ORDER, SETTLE, LIST — plus a Skip so the cashier can fall
 * through to normal POS actions (close register, cash in/out, etc.).
 *
 * Returns { action: 'new_order' | 'settle' | 'list' } via getPayload, or nothing
 * when skipped / closed (makeAwaitable then resolves undefined).
 */
export class ActionHubModal extends Component {
    static template = "laundry_pos.ActionHubModal";
    static components = { Dialog };
    static props = {
        getPayload: Function,
        close: Function,
    };

    choose(action) {
        this.props.getPayload({ action });
        this.props.close();
    }

    skip() {
        this.props.close(); // no payload → caller treats as "do nothing"
    }
}
