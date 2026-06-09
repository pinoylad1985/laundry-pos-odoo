/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { ProductConfiguratorPopup } from "@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup";
import { laundryCodeForProduct } from "@laundry_pos/utils/laundry_products";

patch(OrderSummary.prototype, {
    /**
     * Tapping a laundry line ALWAYS opens the POS configurator, so the cashier
     * can pick options the first time and change the variant/attributes anytime
     * afterwards.
     *
     * We open a FRESH configurator (productTemplate only) and apply its result,
     * rather than Odoo's onOrderlineLongPress (edit-an-existing-line) — the latter
     * assumes a fully-configured line and crashes on our unconfigured ones.
     */
    clickLine(ev, orderline) {
        if (laundryCodeForProduct(orderline?.product_id?.product_tmpl_id)) {
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
        if (!payload) {
            // Cancelled — select the line so it can still be adjusted/deleted.
            this.pos.selectOrderLine(this.currentOrder, orderline);
            return;
        }

        const ptavModel = this.pos.models["product.template.attribute.value"];
        // Turnaround is driven by the order's TAT, not picked in the configurator.
        const selectedIds = this._withTatTurnaround(productTemplate, payload.attribute_value_ids || []);

        const variants = productTemplate.product_variant_ids || [];
        const variantValueIds = new Set();
        for (const v of variants) {
            for (const pv of v.product_template_variant_value_ids || []) {
                variantValueIds.add(pv.id);
            }
        }

        // Resolve the create_variant="always" product.product from the choice;
        // its price already includes the variant adjustment.
        let variant = variants.find((v) => {
            const vv = (v.product_template_variant_value_ids || []).map((pv) => pv.id);
            return vv.length && vv.every((id) => selectedIds.includes(id));
        });
        variant = variant || orderline.product_id || variants[0] || null;

        // Link all chosen values; sum price_extra only for no_variant ones (the
        // variant price already covers the variant-defining values).
        const links = [];
        let priceExtra = 0;
        for (const id of selectedIds) {
            const rec = ptavModel?.get(id);
            if (!rec) continue;
            links.push(["link", rec]);
            if (!variantValueIds.has(id)) priceExtra += rec.price_extra || 0;
        }

        const vals = {
            product_tmpl_id: productTemplate,
            attribute_value_ids: links,
            price_extra: priceExtra,
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

    // Replace any picked turnaround value with the one matching the order's TAT
    // (express/regular), so the schedule — not the cashier — decides turnaround.
    _withTatTurnaround(productTemplate, selectedIds) {
        const tat = this.pos.getOrder()?.laundry_turnaround; // "express" | "regular"
        if (!tat) return [...selectedIds]; // no schedule/TAT set — leave as-is
        let ids = [...selectedIds];
        for (const line of productTemplate.attribute_line_ids || []) {
            if (!String(line.attribute_id?.name || "").startsWith("Turnaround")) continue;
            const vals = line.product_template_value_ids || [];
            const valIds = vals.map((v) => v.id);
            ids = ids.filter((id) => !valIds.includes(id)); // drop any picked turnaround
            const match = vals.find(
                (v) => String(v.name || "").toLowerCase().includes("express") === (tat === "express")
            );
            if (match) ids.push(match.id);
            break;
        }
        return ids;
    },
});
