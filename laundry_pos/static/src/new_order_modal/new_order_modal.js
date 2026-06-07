/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { LAUNDRY_MENU, LONG_SERVICE_CODES } from "@laundry_pos/utils/laundry_instructions";

const SERVICE_TYPES = [
    { code: "dropoff",           label: "Drop-off" },
    { code: "dropoff_delivery",  label: "Drop-off & Delivery" },
    { code: "pickup_delivery",   label: "Pickup & Delivery" },
    { code: "locker",            label: "Locker" },
    { code: "self_service",      label: "Self-service" },
];

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
            // Step 2 — Service menu cart (each tap = one entry)
            // entry: { key, code, productTmplId, productName,
            //          attributeValueIds:[], attributeCustomValues:[], priceExtra, configured }
            cart: [],
            // Step 3 — Service Type
            serviceType: null,
            // Step 4 — Schedule (flat keys to keep OWL reactivity simple)
            claimDate: "",    claimHour: "",
            deliveryDate: "", deliveryHour: "",
            pickupDate: "",   pickupHour: "",
            pdDelDate: "",    pdDelHour: "",
        });
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

        // Cart entries (products + chosen attributes)
        s.cart = Array.isArray(data.cart)
            ? data.cart.map((e) => ({
                  key: e.key || this._uuid(),
                  code: e.code,
                  productTmplId: e.productTmplId,
                  productName: e.productName,
                  attributeValueIds: [...(e.attributeValueIds || [])],
                  attributeCustomValues: e.attributeCustomValues || [],
                  priceExtra: e.priceExtra || 0,
                  configured: !!e.configured,
              }))
            : [];

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
            cart: this._getCart(),
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

    // ── Step 2: Service menu + cart ───────────────────────────────────────

    _uuid() {
        return (globalThis.crypto?.randomUUID?.() ||
            "k" + Math.random().toString(36).slice(2) + Date.now());
    }

    _productById(id) {
        return this.pos.models["product.template"]?.get(id);
    }

    // Find the single live POS product.template for a menu match keyword.
    // Leading word boundary so "press" never matches "(express)" items.
    _matchProduct(match) {
        const kw = String(match).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|[^a-z])${kw}`);
        const all = this.pos.models["product.template"]?.getAll() ?? [];
        return all.find(
            (p) =>
                p.active !== false &&
                p.available_in_pos !== false &&
                re.test(String(p.name || "").toLowerCase())
        );
    }

    // The 4 menu items resolved to live products (drops any not found in POS).
    get menuProducts() {
        return LAUNDRY_MENU.map((item) => ({
            ...item,
            product: this._matchProduct(item.match),
        })).filter((item) => item.product);
    }

    productPrice(product) {
        const price = product?.lst_price ?? product?.list_price;
        if (price == null) return "";
        try { return this.env.utils.formatCurrency(price); } catch {}
        try { return this.pos.env.utils.formatCurrency(price); } catch {}
        return String(price);
    }

    // Each tap adds the product as its own cart line (no qty-merging).
    addToCart(item) {
        if (!item?.product) return;
        this.state.cart.push({
            key: this._uuid(),
            code: item.code,
            productTmplId: item.product.id,
            productName: item.product.name,
            attributeValueIds: [],
            attributeCustomValues: [],
            priceExtra: 0,
            configured: false,
        });
    }

    removeLine(key) {
        const i = this.state.cart.findIndex((e) => e.key === key);
        if (i !== -1) this.state.cart.splice(i, 1);
    }

    // Open the real POS configurator for this line and store the selection.
    async configureLine(entry) {
        const product = this._productById(entry.productTmplId);
        if (!product) return;
        const payload = await makeAwaitable(this.dialog, ProductConfiguratorPopup, {
            productTemplate: product,
        });
        if (!payload) return; // cancelled
        entry.attributeValueIds = payload.attribute_value_ids || [];
        entry.attributeCustomValues = payload.attribute_custom_values || [];
        entry.priceExtra = payload.price_extra || 0;
        entry.configured = true;
    }

    // Selected attribute value names for display chips.
    attrNames(entry) {
        const model = this.pos.models["product.template.attribute.value"];
        return (entry.attributeValueIds || [])
            .map((id) => model?.get(id)?.name)
            .filter(Boolean);
    }

    // A configurable product (has attribute lines) with nothing chosen yet.
    needsConfig(entry) {
        const product = this._productById(entry.productTmplId);
        const hasAttrs = (product?.attribute_line_ids || []).length > 0;
        return hasAttrs && (entry.attributeValueIds || []).length === 0;
    }

    get unconfigured() {
        return this.state.cart.filter((e) => this.needsConfig(e));
    }

    // true when Dry/Wet Clean or Shoe Clean is in the cart (longer turnaround)
    get hasLongService() {
        return this.state.cart.some((e) => LONG_SERVICE_CODES.includes(e.code));
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

    // ── Step 4: Schedule helpers ──────────────────────────────────────────

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

    // ── Turnaround calculation (mirrors pos.html logic) ───────────────────

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
        // Attribute selection is intentionally NOT required here — it is
        // enforced at submit (confirm) with an error popup instead.
        return !!(
            this.state.customerType &&
            this.state.cart.length &&
            this.state.serviceType &&
            this.scheduleComplete &&
            !this.turnaroundError
        );
    }

    // ── Payload helpers ───────────────────────────────────────────────────

    _getCart() {
        return this.state.cart.map((e) => ({
            key: e.key,
            code: e.code,
            productTmplId: e.productTmplId,
            productName: e.productName,
            attributeValueIds: [...(e.attributeValueIds || [])],
            attributeCustomValues: e.attributeCustomValues || [],
            priceExtra: e.priceExtra || 0,
            configured: !!e.configured,
        }));
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
        // Enforce attribute selection only now, with a reminder popup.
        const missing = this.unconfigured;
        if (missing.length) {
            const names = [...new Set(missing.map((e) => e.productName))].join(", ");
            this.dialog.add(AlertDialog, {
                title: "Select product options",
                body: `Please set the attributes for: ${names}`,
            });
            return;
        }
        this.props.getPayload({
            customerType: this.state.customerType,
            serviceType:  this.state.serviceType,
            partner:      this.state.selectedPartner || null,
            editPartner:  null,
            cart:         this._getCart(),
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
            cart:         this._getCart(),
            schedule:     this._getSchedule(),
            turnaround:   this.turnaroundType,
        });
        this.props.close();
    }
}
