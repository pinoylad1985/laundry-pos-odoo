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
            partnerQuery: "",
            selectedPartner: null,
        });
        this.serviceTypes = SERVICE_TYPES;
    }

    selectCustomerType(type) {
        this.state.customerType = type;
        this.state.partnerQuery = "";
        this.state.selectedPartner = null;
    }

    selectServiceType(code) {
        this.state.serviceType = code;
    }

    onSearchInput(ev) {
        this.state.partnerQuery = ev.target.value;
        this.state.selectedPartner = null;
    }

    pickPartner(partner) {
        this.state.selectedPartner = partner;
        this.state.partnerQuery = "";
    }

    editPartner(partner) {
        // Close this modal and open the standard POS partner edit screen
        this.props.getPayload({
            customerType: this.state.customerType,
            serviceType: this.state.serviceType,
            partner: null,
            editPartner: partner,
        });
        this.props.close();
    }

    get filteredPartners() {
        const query = this.state.partnerQuery.trim().toLowerCase();
        if (!query) return [];
        const all = this.pos.models["res.partner"]?.getAll() ?? [];
        return all
            .filter((p) => {
                return (
                    p.name?.toLowerCase().includes(query) ||
                    p.phone?.toLowerCase().includes(query) ||
                    p.mobile?.toLowerCase().includes(query) ||
                    p.street?.toLowerCase().includes(query) ||
                    p.street2?.toLowerCase().includes(query) ||
                    p.city?.toLowerCase().includes(query)
                );
            })
            .slice(0, 15);
    }

    partnerAddress(partner) {
        return [partner.street, partner.street2, partner.city]
            .filter(Boolean)
            .join(", ");
    }

    partnerTags(partner) {
        const tags = partner.category_id || [];
        return tags.filter((t) => t?.name);
    }

    get canConfirm() {
        return this.state.customerType !== null && this.state.serviceType !== null;
    }

    confirm() {
        if (!this.canConfirm) return;
        this.props.getPayload({
            customerType: this.state.customerType,
            serviceType: this.state.serviceType,
            partner: this.state.selectedPartner || null,
            editPartner: null,
        });
        this.props.close();
    }

    skip() {
        this.props.getPayload(null);
        this.props.close();
    }
}
