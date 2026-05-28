/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

const SERVICE_TYPES = [
    { code: "dropoff", label: "Drop-off" },
    { code: "dropoff_delivery", label: "Drop-off & Delivery" },
    { code: "pickup_delivery", label: "Pickup & Delivery" },
    { code: "locker", label: "Locker" },
    { code: "self_service", label: "Self-service" },
];

export class NewOrderModal extends Component {
    static template = "laundry_pos.NewOrderModal";
    static components = { Dialog };
    static props = {
        getPayload: Function,
        close: Function,
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.state = useState({
            customerType: null,
            serviceType: null,
        });
        this.serviceTypes = SERVICE_TYPES;
    }

    selectCustomerType(type) {
        this.state.customerType = type;
    }

    selectServiceType(code) {
        this.state.serviceType = code;
    }

    get canConfirm() {
        return this.state.customerType !== null && this.state.serviceType !== null;
    }

    confirm() {
        if (!this.canConfirm) return;
        this.props.getPayload({
            customerType: this.state.customerType,
            serviceType: this.state.serviceType,
        });
        this.props.close();
    }

    skip() {
        // Allow skipping — order proceeds without service type assignment
        this.props.getPayload(null);
        this.props.close();
    }
}
