/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";

// Rider sign-off, mirroring the register unlock: type the PIN to identify the rider, OR tap
// the people icon to pick a name then enter that rider's PIN. Numpad + keyboard both work.
export class RiderSignoffPopup extends Component {
    static template = "laundry_pos.RiderSignoffPopup";
    static components = { Dialog };
    static props = { close: Function, onSignedOff: Function };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            riders: [], riderId: null, riderName: "", pin: "", error: "", showRiders: false,
        });
        onWillStart(async () => {
            try {
                this.state.riders = await this.orm.call("pos.order", "get_laundry_riders", []);
            } catch {
                this.state.riders = [];
            }
        });
    }

    toggleRiders() {
        this.state.showRiders = !this.state.showRiders;
    }
    selectRider(r) {
        this.state.riderId = r.id;
        this.state.riderName = r.name;
        this.state.showRiders = false;
        this.state.error = "";
    }
    clearRider() {
        this.state.riderId = null;
        this.state.riderName = "";
    }
    pressKey(k) {
        this.state.error = "";
        if (k === "C") {
            this.state.pin = "";
        } else if (k === "del") {
            this.state.pin = this.state.pin.slice(0, -1);
        } else {
            this.state.pin += k;
        }
    }
    onKeydown(ev) {
        if (ev.key === "Enter") {
            this.confirm();
        }
    }
    async confirm() {
        if (!this.state.pin) {
            this.state.error = "Enter the PIN.";
            return;
        }
        const r = await this.orm.call("pos.order", "check_laundry_rider", [
            this.state.pin,
            this.state.riderId || false,
        ]);
        if (!r) {
            this.state.error = this.state.riderId ? "Incorrect PIN." : "PIN not recognized.";
            this.state.pin = "";
            return;
        }
        this.props.onSignedOff(r.name);
        this.props.close();
    }
}
