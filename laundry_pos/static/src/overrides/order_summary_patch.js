/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { laundryCodeForProduct, lineNeedsConfig } from "@laundry_pos/utils/laundry_products";

patch(OrderSummary.prototype, {
    /**
     * For laundry lines, tapping opens the POS attribute configurator instead of
     * plain selection — reusing the built-in onOrderlineLongPress, which applies
     * the chosen variant/attributes to the line in place:
     *   - an UNCONFIGURED laundry line → configurator on the first tap.
     *   - a CONFIGURED laundry line → normal select on first tap (so the numpad /
     *     delete still work), configurator again on re-tap ("re-select to change").
     */
    clickLine(ev, orderline) {
        const isLaundry = !!laundryCodeForProduct(orderline?.product_id?.product_tmpl_id);
        if (isLaundry && (lineNeedsConfig(orderline) || orderline.isSelected())) {
            return this.onOrderlineLongPress(ev, orderline);
        }
        return super.clickLine(ev, orderline);
    },
});
