/** @odoo-module **/

import { Component } from "@odoo/owl";

const SERVICE_LABELS = {
    dropoff: "Drop-off",
    dropoff_delivery: "Drop-off & Delivery",
    pickup_delivery: "Pickup & Delivery",
    locker: "Locker",
    self_service: "Self-service",
};

export class LaundryOrderBanner extends Component {
    static template = "laundry_pos.LaundryOrderBanner";
    static props = {
        mode: String, // 'idle' | 'submitted' | 'skipped'
        serviceType: { type: String, optional: true },
        customerType: { type: String, optional: true },
        partnerName: { type: String, optional: true },
        flash: { type: Boolean, optional: true },
        onSetup: Function,
    };

    get serviceLabel() {
        return SERVICE_LABELS[this.props.serviceType] || this.props.serviceType || "—";
    }

    get customerLabel() {
        if (this.props.partnerName) return this.props.partnerName;
        if (this.props.customerType === "new") return "New Customer";
        if (this.props.customerType === "returning") return "Returning Customer";
        return "—";
    }
}
