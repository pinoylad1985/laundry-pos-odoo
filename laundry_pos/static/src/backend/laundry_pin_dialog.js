/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";

// Backend PIN dialog, styled like the register unlock: type a PIN to identify the person,
// or tap the people icon to pick a name then enter that person's PIN. Verified server-side.
// Reused for the Staff and Folding-time fields (title/list/check passed as props).
export class LaundryPinDialog extends Component {
    static template = "laundry_pos.LaundryPinDialog";
    static components = { Dialog };
    static props = {
        title: String,
        listMethod: String, // pos.order @api.model returning [{id, name}]
        checkMethod: String, // pos.order @api.model (pin, id) -> {id, name} | false
        onConfirm: Function, // ({id, name}) => void
        close: Function,
        // Require mode: the PIN must be THIS person's (e.g. the order's Staff). When set,
        // there is no name picker — a note tells the user the PIN must match requireName.
        requireId: { type: [Number, Boolean], optional: true },
        requireName: { type: String, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            list: [], selId: this.props.requireId || null, selName: this.props.requireName || "",
            pin: "", error: "", showList: false,
        });
        onWillStart(async () => {
            if (this.props.requireId) {
                return; // fixed to the required person; no list needed
            }
            try {
                this.state.list = await this.orm.call("pos.order", this.props.listMethod, []);
            } catch {
                this.state.list = [];
            }
        });
    }

    get requireMode() {
        return !!this.props.requireId;
    }

    toggleList() {
        this.state.showList = !this.state.showList;
    }
    select(x) {
        this.state.selId = x.id;
        this.state.selName = x.name;
        this.state.showList = false;
        this.state.error = "";
    }
    clearSel() {
        this.state.selId = null;
        this.state.selName = "";
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
        const id = this.props.requireId || this.state.selId || false;
        const r = await this.orm.call("pos.order", this.props.checkMethod, [this.state.pin, id]);
        if (!r) {
            this.state.error = this.props.requireId
                ? `Wrong PIN — it must be ${this.props.requireName}'s (the Staff on this order).`
                : this.state.selId
                ? "Incorrect PIN."
                : "PIN not recognized.";
            this.state.pin = "";
            return;
        }
        this.props.onConfirm(r);
        this.props.close();
    }
}
