/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";
import { laundryCodeForProduct, lineNeedsConfig } from "@laundry_pos/utils/laundry_products";

patch(OrderSummary.prototype, {
    /**
     * Tapping a laundry line opens the POS configurator to pick / change its
     * variants & attributes:
     *   - an UNCONFIGURED laundry line → configurator on the first tap.
     *   - a CONFIGURED laundry line → normal select on first tap (so numpad /
     *     delete still work), configurator again on re-tap ("re-select to change").
     *
     * We open a FRESH configurator (productTemplate only) and apply its result,
     * rather than Odoo's onOrderlineLongPress (edit-an-existing-line) — the latter
     * assumes a fully-configured line and crashes on our unconfigured ones.
     */
    clickLine(ev, orderline) {
        const productTmpl = orderline?.product_id?.product_tmpl_id;
        const isLaundry = !!laundryCodeForProduct(productTmpl);
        if (isLaundry && (lineNeedsConfig(orderline) || orderline.isSelected())) {
            this._laundryConfigureLine(orderline);
            return;
        }
        return super.clickLine(ev, orderline);
    },

    async _laundryConfigureLine(orderline) {
        const productTemplate = orderline.product_id?.product_tmpl_id;
        if (!productTemplate) return;

        const payload = await makeAwaitable(this.dialog, ProductConfiguratorPopup, {
            productTemplate,
        });
        if (!payload) return; // cancelled — leave the line unchanged

        const ptavModel = this.pos.models["product.template.attribute.value"];
        const selectedIds = payload.attribute_value_ids || [];
        const links = selectedIds
            .map((id) => ptavModel?.get(id))
            .filter(Boolean)
            .map((rec) => ["link", rec]);

        // Resolve the create_variant="always" product.product from the choice;
        // its price already includes the variant adjustment.
        const variants = productTemplate.product_variant_ids || [];
        let variant = variants.find((v) => {
            const vv = (v.product_template_variant_value_ids || []).map((pv) => pv.id);
            return vv.length && vv.every((id) => selectedIds.includes(id));
        });
        variant = variant || orderline.product_id || variants[0] || null;

        const vals = {
            product_tmpl_id: productTemplate,
            attribute_value_ids: links,
            price_extra: payload.price_extra || 0,
        };
        if (variant) vals.product_id = variant;

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
