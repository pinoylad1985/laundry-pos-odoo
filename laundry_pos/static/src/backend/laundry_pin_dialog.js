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
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            list: [], selId: null, selName: "", pin: "", error: "", showList: false,
        });
        onWillStart(async () => {
            try {
                this.state.list = await this.orm.call("pos.order", this.props.listMethod, []);
            } catch {
                this.state.list = [];
            }
        });
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
        const r = await this.orm.call("pos.order", this.props.checkMethod, [
            this.state.pin,
            this.state.selId || false,
        ]);
        if (!r) {
            this.state.error = this.state.selId ? "Incorrect PIN." : "PIN not recognized.";
            this.state.pin = "";
            return;
        }
        this.props.onConfirm(r);
        this.props.close();
    }
}
