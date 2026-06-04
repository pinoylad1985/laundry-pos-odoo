/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { SERVICE_INSTRUCTIONS } from "@laundry_pos/utils/laundry_instructions";

const SERVICES = [
    { code: "wdf",   label: "Wash-Dry-Fold" },
    { code: "dwc",   label: "Dry/Wet Clean" },
    { code: "press", label: "Press" },
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
        initialData: { type: Object, optional: true },
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
            // Step 2b — per-service instructions: { wdf: { soil, load, ... }, ... }
            instructions: {},
            expandedService: null,
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

        // Hour pills: two columns of 12 — AM (12 AM–11 AM) and PM (12 PM–11 PM)
        const label = (h) => {
            const ampm = h < 12 ? "AM" : "PM";
            const disp = h % 12 === 0 ? 12 : h % 12;
            return `${disp} ${ampm}`;
        };
        const mk = (h) => ({ h, value: String(h).padStart(2, "0") + ":00", label: label(h) });
        this.hoursAM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(mk);
        this.hoursPM = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map(mk);

        // Pre-populate from previously submitted details (Change / after reload)
        this._applyInitialData(this.props.initialData);
    }

    // Restore saved details into form state so the cashier can edit them
    _applyInitialData(data) {
        if (!data) return;
        const s = this.state;
        s.customerType = data.customerType || null;
        s.serviceType  = data.serviceType  || null;

        // Services array of codes → boolean flags
        const codes = data.services || [];
        s.svcWdf   = codes.includes("wdf");
        s.svcPress = codes.includes("press");
        s.svcDwc   = codes.includes("dwc");
        s.svcShoe  = codes.includes("shoe");

        // Per-service instruction selections
        s.instructions = data.instructions ? { ...data.instructions } : {};

        // Schedule — note storage uses deliveryDate/deliveryHour even for
        // pickup_delivery, which map to pdDelDate/pdDelHour in state.
        const sched = data.schedule || {};
        const st = data.serviceType;
        if (st === "dropoff") {
            s.claimDate = sched.claimDate || "";
            s.claimHour = sched.claimHour || "";
        } else if (st === "dropoff_delivery") {
            s.deliveryDate = sched.deliveryDate || "";
            s.deliveryHour = sched.deliveryHour || "";
        } else if (st === "pickup_delivery" || st === "locker") {
            s.pickupDate = sched.pickupDate || "";
            s.pickupHour = sched.pickupHour || "";
            s.pdDelDate  = sched.deliveryDate || "";
            s.pdDelHour  = sched.deliveryHour || "";
        }
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
            instructions: this._getInstructions(),
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
        // pos_tag_names is a comma-joined string computed server-side, so it is
        // available for both pre-loaded and on-demand partners (unlike the
        // category_id relation, whose category records aren't all loaded).
        const names = String(partner.pos_tag_names || "");
        return names ? names.split(",").map((s) => s.trim()).filter(Boolean) : [];
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

    setHour(field, value) {
        this.state[field] = value;
    }

    /**
     * Whether an hour pill is unavailable for a given selector.
     * @param {string} kind - 'claim' | 'pickup' | 'delivery'
     * @param {number} h - hour 0..23
     */
    isHourDisabled(kind, h) {
        // 4 AM–5 AM closed for every selector, regardless of service type
        if (h === 4 || h === 5) return true;
        if (kind === "pickup")   return h === 2 || h === 3; // +2 AM–3 AM
        if (kind === "delivery") return h === 2 || h === 3; // +2 AM–3 AM
        return false;
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

    // ── Per-service instructions (expandable) ─────────────────────────────

    instructionFields(svc) {
        return SERVICE_INSTRUCTIONS[svc] || [];
    }

    // code → label, for instruction panel headers
    get servicesByCode() {
        return Object.fromEntries(this.services.map((s) => [s.code, s.label]));
    }

    getInstr(svc, key) {
        return this.state.instructions[svc]?.[key] ?? "";
    }

    setInstr(svc, key, value) {
        if (!this.state.instructions[svc]) {
            this.state.instructions[svc] = {};
        }
        this.state.instructions[svc][key] = value;
    }

    onInstrInput(svc, key, ev) {
        this.setInstr(svc, key, ev.target.value);
    }

    toggleExpand(svc) {
        this.state.expandedService = this.state.expandedService === svc ? null : svc;
    }

    isExpanded(svc) {
        return this.state.expandedService === svc;
    }

    // Any instruction value set for this service? (drives the pill indicator)
    hasInstructions(svc) {
        const data = this.state.instructions[svc];
        if (!data) return false;
        return Object.values(data).some((v) => v !== "" && v != null);
    }

    // Services currently selected, in display order
    get selectedServices() {
        return this.services
            .map((s) => s.code)
            .filter((code) => this.isServiceSelected(code));
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

    // Plain copy of instructions, limited to currently-selected services
    _getInstructions() {
        const out = {};
        for (const code of this.selectedServices) {
            const data = this.state.instructions[code];
            if (data && Object.keys(data).length) {
                out[code] = { ...data };
            }
        }
        return out;
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
            instructions: this._getInstructions(),
            schedule:     this._getSchedule(),
            turnaround:   this.turnaroundType,
        });
        this.props.close();
    }

    skip() {
        // Save whatever was selected so far so it can be resumed/edited later
        this.props.getPayload({
            skipped:      true,
            customerType: this.state.customerType,
            serviceType:  this.state.serviceType,
            partner:      this.state.selectedPartner || null,
            services:     this._getServices(),
            instructions: this._getInstructions(),
            schedule:     this._getSchedule(),
            turnaround:   this.turnaroundType,
        });
        this.props.close();
    }
}
