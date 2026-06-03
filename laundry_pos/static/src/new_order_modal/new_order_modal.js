/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

const SERVICES = [
    { code: "wdf",   label: "Wash-Dry-Fold" },
    { code: "press", label: "Press" },
    { code: "dwc",   label: "Dry/Wet Clean" },
    { code: "shoe",  label: "Shoe Clean" },
];

const SERVICE_TYPES = [
    { code: "dropoff",           label: "Drop-off" },
    { code: "dropoff_delivery",  label: "Drop-off & Delivery" },
    { code: "pickup_delivery",   label: "Pickup & Delivery" },
    { code: "locker",            label: "Locker" },
    { code: "self_service",      label: "Self-service" },
];

// Maps service code → state key
const SVC_KEY = { wdf: "svcWdf", press: "svcPress", dwc: "svcDwc", shoe: "svcShoe" };

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
            // Step 1 — Customer
            customerType: null,
            partnerQuery: "",
            selectedPartner: null,
            // Step 2 — Services (multi-select)
            svcWdf: false,
            svcPress: false,
            svcDwc: false,
            svcShoe: false,
            // Step 3 — Service Type
            serviceType: null,
            // Step 4 — Schedule (flat keys to keep OWL reactivity simple)
            claimDate: "",    claimHour: "",
            deliveryDate: "", deliveryHour: "",
            pickupDate: "",   pickupHour: "",
            pdDelDate: "",    pdDelHour: "",
        });
        this.services = SERVICES;
        this.serviceTypes = SERVICE_TYPES;

        const fmtHour = (h) => {
            if (h === 0)  return "12:00 AM";
            if (h === 12) return "12:00 PM";
            return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
        };
        const mkOpt = (h) => ({ value: String(h).padStart(2, "0") + ":00", label: fmtHour(h) });

        // Claim (Drop-off): 6 AM – 3 AM (next day)
        this.claimHourOptions = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3].map(mkOpt);

        // Pickup / Delivery: 6 AM – 12 AM (midnight)
        this.pickupDeliveryHourOptions = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0].map(mkOpt);
    }

    // ── Step 1: Customer ──────────────────────────────────────────────────

    selectCustomerType(type) {
        this.state.customerType = type;
        this.state.partnerQuery = "";
        this.state.selectedPartner = null;
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
        this.props.getPayload({
            customerType: this.state.customerType,
            serviceType: this.state.serviceType,
            partner: null,
            editPartner: partner,
            services: this._getServices(),
            schedule: this._getSchedule(),
            turnaround: this.turnaroundType,
        });
        this.props.close();
    }

    get filteredPartners() {
        const query = this.state.partnerQuery.trim().toLowerCase();
        if (!query) return [];
        const all = this.pos.models["res.partner"]?.getAll() ?? [];
        const s = (v) => String(v || "").toLowerCase();
        return all
            .filter((p) =>
                s(p.name).includes(query) ||
                s(p.phone).includes(query) ||
                s(p.mobile).includes(query) ||
                s(p.street).includes(query) ||
                s(p.street2).includes(query) ||
                s(p.city).includes(query)
            )
            .slice(0, 15);
    }

    get showNoResults() {
        return (
            !this.state.selectedPartner &&
            this.state.partnerQuery.trim().length > 0 &&
            this.filteredPartners.length === 0
        );
    }

    partnerAddress(partner) {
        return [partner.street, partner.street2, partner.city]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
            .join(", ");
    }

    partnerTags(partner) {
        return (partner.category_id || []).filter((t) => t?.name);
    }

    // Returns [Today, Tomorrow, day-after] as { value: 'YYYY-MM-DD', label }
    get quickDates() {
        return [0, 1, 2].map((offset) => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const value = `${y}-${m}-${day}`;
            const label = offset === 0 ? "Today"
                        : offset === 1 ? "Tomorrow"
                        : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return { value, label };
        });
    }

    setDate(field, value) {
        this.state[field] = value;
    }

    // ── Step 2: Services ──────────────────────────────────────────────────

    toggleService(code) {
        this.state[SVC_KEY[code]] = !this.state[SVC_KEY[code]];
        // Changing services may change turnaround thresholds — reset schedule
        this._resetSchedule();
    }

    isServiceSelected(code) {
        return !!this.state[SVC_KEY[code]];
    }

    get hasAnyService() {
        return this.state.svcWdf || this.state.svcPress ||
               this.state.svcDwc || this.state.svcShoe;
    }

    // true when Dry/Wet Clean or Shoe Clean is included (longer turnaround)
    get hasLongService() {
        return this.state.svcDwc || this.state.svcShoe;
    }

    // ── Step 3: Service Type ──────────────────────────────────────────────

    selectServiceType(code) {
        this.state.serviceType = code;
        this._resetSchedule();
    }

    _resetSchedule() {
        this.state.claimDate = "";    this.state.claimHour = "";
        this.state.deliveryDate = ""; this.state.deliveryHour = "";
        this.state.pickupDate = "";   this.state.pickupHour = "";
        this.state.pdDelDate = "";    this.state.pdDelHour = "";
    }

    // ── Step 4: Turnaround calculation (mirrors pos.html logic) ──────────

    get turnaroundThreshold() {
        const long = this.hasLongService;
        const ret  = this.state.customerType === "returning";
        return long ? (ret ? 48 : 72) : (ret ? 18 : 24);
    }

    get turnaroundMinHrs() {
        return this.hasLongService ? 24 : 6;
    }

    _ms(dateVal, hourVal) {
        if (!dateVal || !hourVal) return null;
        return new Date(`${dateVal}T${hourVal}:00`).getTime();
    }

    get diffHours() {
        const s  = this.state;
        const st = s.serviceType;
        if (st === "pickup_delivery" || st === "locker") {
            const pu  = this._ms(s.pickupDate, s.pickupHour);
            const del = this._ms(s.pdDelDate, s.pdDelHour);
            if (pu && del) return Math.round((del - pu) / 3_600_000);
        } else if (st === "dropoff") {
            const claim = this._ms(s.claimDate, s.claimHour);
            if (claim) return Math.round((claim - Date.now()) / 3_600_000);
        } else if (st === "dropoff_delivery") {
            const del = this._ms(s.deliveryDate, s.deliveryHour);
            if (del) return Math.round((del - Date.now()) / 3_600_000);
        }
        return null;
    }

    get turnaroundType() {
        const diff = this.diffHours;
        if (diff === null) return null;
        return diff < this.turnaroundThreshold ? "express" : "regular";
    }

    get turnaroundError() {
        const diff = this.diffHours;
        if (diff === null || diff >= this.turnaroundMinHrs) return null;
        const who = this.hasLongService
            ? "Shoe Clean / Dry-Wet Cleaning"
            : "WDF / Press";
        return `${who} requires at least ${this._fmt(this.turnaroundMinHrs)}`;
    }

    _fmt(hrs) {
        if (hrs < 24) return `${hrs} hrs`;
        const d = hrs / 24;
        return `${d} day${d > 1 ? "s" : ""}`;
    }

    // Express: "6 hrs – under 24 hrs"
    get expressLabel() {
        return `${this._fmt(this.turnaroundMinHrs)} – under ${this._fmt(this.turnaroundThreshold)}`;
    }

    // Regular: "at least 24 hrs"
    get regularLabel() {
        return `at least ${this._fmt(this.turnaroundThreshold)}`;
    }

    // ── Validation ────────────────────────────────────────────────────────

    get scheduleComplete() {
        const s  = this.state;
        const st = s.serviceType;
        if (!st || st === "self_service") return true;
        if (st === "dropoff")          return !!(s.claimDate && s.claimHour);
        if (st === "dropoff_delivery") return !!(s.deliveryDate && s.deliveryHour);
        // pickup_delivery or locker
        return !!(s.pickupDate && s.pickupHour && s.pdDelDate && s.pdDelHour);
    }

    get canConfirm() {
        return !!(
            this.state.customerType &&
            this.hasAnyService &&
            this.state.serviceType &&
            this.scheduleComplete &&
            !this.turnaroundError
        );
    }

    // ── Payload helpers ───────────────────────────────────────────────────

    _getServices() {
        const codes = [];
        if (this.state.svcWdf)   codes.push("wdf");
        if (this.state.svcPress) codes.push("press");
        if (this.state.svcDwc)   codes.push("dwc");
        if (this.state.svcShoe)  codes.push("shoe");
        return codes;
    }

    _getSchedule() {
        const s  = this.state;
        const st = s.serviceType;
        if (!st || st === "self_service") return {};
        if (st === "dropoff")
            return { claimDate: s.claimDate, claimHour: s.claimHour };
        if (st === "dropoff_delivery")
            return { deliveryDate: s.deliveryDate, deliveryHour: s.deliveryHour };
        return {
            pickupDate: s.pickupDate,   pickupHour: s.pickupHour,
            deliveryDate: s.pdDelDate,  deliveryHour: s.pdDelHour,
        };
    }

    confirm() {
        if (!this.canConfirm) return;
        this.props.getPayload({
            customerType: this.state.customerType,
            serviceType:  this.state.serviceType,
            partner:      this.state.selectedPartner || null,
            editPartner:  null,
            services:     this._getServices(),
            schedule:     this._getSchedule(),
            turnaround:   this.turnaroundType,
        });
        this.props.close();
    }

    skip() {
        this.props.getPayload(null);
        this.props.close();
    }
}
