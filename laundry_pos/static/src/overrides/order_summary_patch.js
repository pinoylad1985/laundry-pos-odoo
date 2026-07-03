/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";
import {
    laundryCodeForProduct,
    withTatTurnaround,
    buildConfiguredLineVals,
    wdfBilledQty,
} from "@laundry_pos/utils/laundry_products";
import { setEditSelection, setEditWeight, setEditNote } from "@laundry_pos/overrides/product_configurator_popup_patch";
import { allowWdfQty } from "@laundry_pos/overrides/pos_order_line_patch";

patch(OrderSummary.prototype, {
    /**
     * Tapping a laundry line ALWAYS opens the POS configurator, so the cashier
     * can pick options the first time and change the variant/attributes anytime.
     * We open a FRESH configurator (productTemplate only) — Odoo's
     * onOrderlineLongPress assumes a fully-configured line and crashes on ours.
     */
    clickLine(ev, orderline) {
        const tmpl = orderline?.product_id?.product_tmpl_id;
        if (laundryCodeForProduct(tmpl)) {
            // Tapping a laundry line opens the configurator first (when the
            // product has options). After confirming, the re-added line is
            // selected, so the numpad can adjust its qty/weight — except Dry/Wet
            // Clean and Shoe Clean, which stay clamped to 1.
            if ((tmpl?.attribute_line_ids?.length || 0) > 0) {
                this._laundryConfigureLine(orderline);
                return;
            }
            return super.clickLine(ev, orderline);
        }
        return super.clickLine(ev, orderline);
    },

    async _laundryConfigureLine(orderline) {
        const productTemplate = orderline.product_id?.product_tmpl_id;
        if (!productTemplate) return;

        // Pre-fill the configurator with the line's current selection.
        setEditSelection((orderline.attribute_value_ids || []).map((v) => v.id));
        setEditWeight(orderline.laundry_actual_weight); // pre-fill the WDF box with the actual weight
        setEditNote(orderline.customer_note); // pre-fill the Note box
        let payload;
        try {
            payload = await makeAwaitable(this.dialog, ProductConfiguratorPopup, {
                productTemplate,
            });
        } finally {
            setEditSelection(null);
            setEditWeight(null);
            setEditNote(null);
        }
        if (!payload) {
            // Cancelled — select the line so it can still be adjusted/deleted.
            this.pos.selectOrderLine(this.currentOrder, orderline);
            return;
        }

        // Turnaround is driven by the order's TAT, not picked in the configurator.
        const tat = this.pos.getOrder()?.laundry_turnaround;
        const selectedIds = withTatTurnaround(
            productTemplate,
            payload.attribute_value_ids || [],
            tat
        );
        const vals = buildConfiguredLineVals(this.pos, productTemplate, selectedIds);
        if (!vals.product_id) vals.product_id = orderline.product_id;
        // Wash-Dry-Fold: the BILLED qty is the rounded-up weight; otherwise preserve
        // the line's quantity.
        vals.qty = payload.laundryWeightKg || orderline.qty;
        // Keep the ACTUAL entered weight on the line — shown as-is like a variant
        // attribute in the cart and receipt (see order_line_patch).
        const actual = payload.laundryActualWeight || orderline.laundry_actual_weight;
        if (actual) {
            vals.laundry_actual_weight = actual;
        }

        // Swap the tapped line for the freshly configured one (the no-merge patch
        // keeps it as its own separate line).
        const order = this.currentOrder;
        if (typeof order.removeOrderline === "function") {
            order.removeOrderline(orderline);
        } else if (typeof orderline.delete === "function") {
            orderline.delete();
        }
        const newLine = await this.pos.addLineToCurrentOrder(vals, {}, false);
        // Make sure the weight lands on the new line so it shows immediately the
        // FIRST time (not only after re-opening the configurator).
        if (newLine && actual) {
            newLine.laundry_actual_weight = actual;
        }
        // Apply the WDF minimum-weight billing now (it's re-checked again at payment
        // in case WDF lines are added/removed directly in the cart).
        this._laundryApplyWdfBilling();
    },

    // Set every CONFIGURED Wash-Dry-Fold line's qty to its billed value — the rounded
    // actual weight or the per-line minimum (6KG single / 4KG when 2+), whichever is
    // higher. Unconfigured lines are left until they get a weight.
    _laundryApplyWdfBilling() {
        const wdf = (this.currentOrder?.lines || []).filter(
            (l) => laundryCodeForProduct(l.product_id?.product_tmpl_id) === "wdf"
        );
        allowWdfQty(() => {
            for (const l of wdf) {
                if (l.laundry_actual_weight) {
                    l.setQuantity(wdfBilledQty(l.laundry_actual_weight, wdf.length));
                }
            }
        });
    },
});
