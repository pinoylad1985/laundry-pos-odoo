/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";

// Rider sign-off for Pickup & Delivery / Locker orders. Loads the tagged riders, lets the
// rider pick their name and enter their POS PIN; on a valid PIN it calls onSignedOff(name).
export class RiderSignoffPopup extends Component {
    static template = "laundry_pos.RiderSignoffPopup";
    static components = { Dialog };
    static props = {
        close: Function,
        onSignedOff: Function,
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({ riders: [], riderId: null, pin: "", error: "" });
        onWillStart(async () => {
            this.state.riders = await this.orm.call("pos.order", "get_laundry_riders", []);
        });
    }

    selectRider(id) {
        this.state.riderId = id;
        this.state.error = "";
    }

    async confirm() {
        if (!this.state.riderId) {
            this.state.error = "Select a rider.";
            return;
        }
        if (!this.state.pin) {
            this.state.error = "Enter the rider's PIN.";
            return;
        }
        const name = await this.orm.call("pos.order", "verify_laundry_rider", [
            this.state.riderId,
            this.state.pin,
        ]);
        if (!name) {
            this.state.error = "Incorrect PIN.";
            this.state.pin = "";
            return;
        }
        this.props.onSignedOff(name);
        this.props.close();
    }
}
