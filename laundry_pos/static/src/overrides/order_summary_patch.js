/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";
import {
    laundryCodeForProduct,
    withTatTurnaround,
    buildConfiguredLineVals,
} from "@laundry_pos/utils/laundry_products";

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

        const payload = await makeAwaitable(this.dialog, ProductConfiguratorPopup, {
            productTemplate,
        });
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
        vals.qty = orderline.qty; // preserve quantity (e.g. merged Press lines)

        // Swap the tapped line for the freshly configured one (the no-merge patch
        // keeps it as its own separate line).
        const order = this.currentOrder;
        if (typeof order.removeOrderline === "function") {
            order.removeOrderline(orderline);
        } else if (typeof orderline.delete === "function") {
            orderline.delete();
        }
        await this.pos.addLineToCurrentOrder(vals, {}, false);
    },
});
