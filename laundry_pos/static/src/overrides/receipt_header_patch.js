/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";
import { LAUNDRY_MENU } from "@laundry_pos/utils/laundry_instructions";
import { lsLoad } from "@laundry_pos/utils/laundry_storage";

const SERVICE_LABELS = {
    dropoff: "Drop-off",
    dropoff_delivery: "Drop-off & Delivery",
    pickup_delivery: "Pickup & Delivery",
    locker: "Locker",
    self_service: "Self-service",
};

function fmt(date, hour) {
    if (!date) return "";
    return hour ? `${date} ${hour}` : date;
}

patch(ReceiptHeader.prototype, {
    // Laundry order details for the receipt, as [label, value] rows.
    get laundryDetails() {
        const order = this.props.order;
        if (!order) return [];

        // laundry_* are JS-only fields; fall back to localStorage for reprints.
        let svcType = order.laundry_service_type;
        let custType = order.laundry_customer_type;
        let turnaround = order.laundry_turnaround;
        let schedule = order.laundry_schedule || {};
        if (!svcType) {
            const stored = lsLoad(order.uuid);
            if (stored?.status === "submitted") {
                svcType = stored.serviceType;
                custType = stored.customerType;
                turnaround = stored.turnaround;
                schedule = stored.schedule || {};
            }
        }
        if (!svcType) return [];

        const rows = [];
        rows.push(["Customer Type",
            custType === "new" ? "New" : custType === "returning" ? "Returning" : "—"]);

        const labelByCode = Object.fromEntries(LAUNDRY_MENU.map((m) => [m.code, m.label]));
        const codes = [];
        for (const l of order.lines || []) {
            const c = laundryCodeForProduct(l.product_id?.product_tmpl_id);
            if (c && !codes.includes(c)) codes.push(c);
        }
        rows.push(["Services", codes.map((c) => labelByCode[c] || c).join(", ")]);

        rows.push(["TAT",
            turnaround === "express" ? "Express" : turnaround === "regular" ? "Regular" : "—"]);
        rows.push(["Service Type", SERVICE_LABELS[svcType] || ""]);

        if (schedule.pickupDate) {
            rows.push(["Pickup", fmt(schedule.pickupDate, schedule.pickupHour)]);
        }
        if (schedule.deliveryDate) {
            rows.push([svcType === "dropoff" ? "Claim" : "Delivery",
                fmt(schedule.deliveryDate, schedule.deliveryHour)]);
        } else if (schedule.claimDate) {
            rows.push(["Claim", fmt(schedule.claimDate, schedule.claimHour)]);
        }
        return rows;
    },
});
