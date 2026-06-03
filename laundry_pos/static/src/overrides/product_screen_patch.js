/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { NewOrderModal } from "@laundry_pos/new_order_modal/new_order_modal";
import { lsSave, lsLoad } from "@laundry_pos/utils/laundry_storage";
import {
    SERVICE_INSTRUCTIONS,
    SERVICE_PRODUCT_KEYWORDS,
} from "@laundry_pos/utils/laundry_instructions";
import { useState, useEffect, onMounted, onWillUnmount } from "@odoo/owl";

const SERVICE_LABELS = {
    dropoff: "Drop-off",
    dropoff_delivery: "Drop-off & Delivery",
    pickup_delivery: "Pickup & Delivery",
    locker: "Locker",
    self_service: "Self-service",
};

patch(ProductScreen.prototype, {
    setup() {
        super.setup();

        // mode: 'idle' | 'submitted' | 'skipped'
        this.laundryState = useState({ mode: "idle", flash: false, turnaround: null });

        // Sync banner mode when switching orders or returning to POS
        useEffect(
            () => {
                const order = this.pos.getOrder();
                const stored = lsLoad(order?.uuid);

                // Rehydrate JS-only fields from localStorage after a reload
                // (laundry_* props are not synced to the server, so they vanish).
                if (stored?.status === "submitted" && !order?.laundry_service_type && order) {
                    order.laundry_service_type  = stored.serviceType;
                    order.laundry_customer_type = stored.customerType;
                    order.laundry_services      = stored.services     || [];
                    order.laundry_instructions  = stored.instructions || {};
                    order.laundry_schedule      = stored.schedule     || {};
                    order.laundry_turnaround    = stored.turnaround    || null;
                    order._laundryCartPopulated = true; // lines already on the order after reload
                }

                if (order?.laundry_service_type) {
                    this.laundryState.mode = "submitted";
                    this.laundryState.turnaround = stored?.turnaround || order?.laundry_turnaround || null;
                } else if (stored?.status === "skipped" || order?._laundrySetupProcessed) {
                    this.laundryState.mode = "skipped";
                    this.laundryState.turnaround = null;
                } else {
                    this.laundryState.mode = "idle";
                    this.laundryState.turnaround = null;
                }
            },
            () => [this.pos.getOrder()?.uuid]
        );

        // Show modal for freshly created orders
        useEffect(
            () => {
                const order = this.pos.getOrder();
                if (order?._needsLaundrySetup) {
                    order._needsLaundrySetup = false;
                    this._showLaundrySetupModal(order, false);
                }
            },
            () => [this.pos.getOrder()?.uuid]
        );

        // Listen for flash signal fired by PosStore when Customer button is blocked
        onMounted(() => {
            this._laundryFlashHandler = () => this._flashBanner();
            document.addEventListener("laundry-flash-needed", this._laundryFlashHandler);
        });
        onWillUnmount(() => {
            document.removeEventListener("laundry-flash-needed", this._laundryFlashHandler);
        });
    },

    _flashBanner() {
        this.laundryState.flash = true;
        setTimeout(() => { this.laundryState.flash = false; }, 600);
    },

    _getLaundryServiceLabel() {
        const order = this.pos.getOrder();
        return SERVICE_LABELS[order?.laundry_service_type] || "";
    },

    _getLaundryCustomerLabel() {
        const order = this.pos.getOrder();
        if (order?.partner_id?.name) return order.partner_id.name;
        if (order?.laundry_customer_type === "new") return "New Customer";
        if (order?.laundry_customer_type === "returning") return "Returning Customer";
        return "";
    },

    _getLaundryTurnaroundLabel() {
        const t = this.laundryState.turnaround;
        if (t === "express") return "⚡ Express";
        if (t === "regular") return "🕐 Regular";
        return "";
    },

    _getLaundryTurnaroundType() {
        return this.laundryState.turnaround || "";
    },

    /**
     * @param {object} order
     * @param {boolean} isChange - when true, skipping keeps the existing setup intact
     */
    async _showLaundrySetupModal(order, isChange) {
        if (order) order._laundrySetupProcessed = true;

        // Pre-populate modal with any previously saved details — whether the
        // order was fully submitted OR skipped with partial selections.
        const stored = lsLoad(order?.uuid);
        const initData = (stored && (stored.serviceType || stored.customerType ||
                          (stored.services || []).length)) ? stored : null;

        const result = await makeAwaitable(this.dialog, NewOrderModal, {
            initialData: initData || undefined,
        });

        // Explicit "Skip for now" — save whatever was selected for later editing
        if (result?.skipped) {
            this.laundryState.mode = "skipped";
            this.laundryState.turnaround = null;
            lsSave(order?.uuid, {
                status:       "skipped",
                serviceType:  result.serviceType  || null,
                customerType: result.customerType || null,
                services:     result.services     || [],
                instructions: result.instructions || {},
                schedule:     result.schedule     || {},
                turnaround:   result.turnaround   || null,
            });
            // Keep any customer the cashier already picked
            if (result.partner) {
                this.pos.setPartnerToCurrentOrder(result.partner);
            }
            return;
        }

        // Closed via X / escape (no payload) — keep existing setup on Change,
        // otherwise mark as skipped with nothing saved.
        if (!result) {
            if (!isChange) {
                this.laundryState.mode = "skipped";
                this.laundryState.turnaround = null;
                lsSave(order?.uuid, { status: "skipped" });
            }
            return;
        }

        this.laundryState.mode = "submitted";
        this.laundryState.turnaround = result.turnaround;

        order.laundry_service_type  = result.serviceType;
        order.laundry_customer_type = result.customerType;
        order.laundry_services      = result.services     || [];
        order.laundry_instructions  = result.instructions || {};
        order.laundry_schedule      = result.schedule     || {};
        order.laundry_turnaround    = result.turnaround    || null;

        // Persist all details so they survive reload and pre-populate the Change modal
        lsSave(order?.uuid, {
            status:       "submitted",
            serviceType:  result.serviceType,
            customerType: result.customerType,
            services:     result.services     || [],
            instructions: result.instructions || {},
            schedule:     result.schedule     || {},
            turnaround:   result.turnaround    || null,
        });

        if (result.editPartner) {
            await this.pos.selectPartner(order);
        } else if (result.partner) {
            this.pos.setPartnerToCurrentOrder(result.partner);
        }

        // Prepopulate the cart with the matching products (once per order)
        await this._prepopulateLaundryCart(order, result);
    },

    // ── Cart pre-population + variant pre-selection ───────────────────────

    /**
     * Add one line per matching product for each selected service, with the
     * turnaround variant and instruction attributes pre-set. Runs once per order.
     */
    async _prepopulateLaundryCart(order, result) {
        if (!order || order._laundryCartPopulated) return;
        order._laundryCartPopulated = true;
        try {
            for (const svc of result.services || []) {
                const products = this._findServiceProducts(svc);
                const svcInstr = (result.instructions || {})[svc] || {};
                for (const product of products) {
                    await this._addServiceProduct(product, svc, svcInstr, result.turnaround);
                }
            }
        } catch (e) {
            console.warn("[laundry_pos] cart pre-population failed:", e);
        }
    },

    // Every non-archived POS product whose name contains a keyword for the service.
    // Uses a LEADING word boundary so "press" never matches "(express)" items.
    _findServiceProducts(svc) {
        const keywords = SERVICE_PRODUCT_KEYWORDS[svc] || [];
        const all = this.pos.models["product.template"]?.getAll() ?? [];
        return all.filter((p) => {
            if (p.active === false) return false; // skip archived
            const name = String(p.name || "").toLowerCase();
            return keywords.some((k) => {
                const kw = k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return new RegExp(`(^|[^a-z])${kw}`).test(name);
            });
        });
    },

    /**
     * Add one configured line for a product.
     *
     * Turnaround Time is a `create_variant="always"` attribute, so Express and
     * Regular are SEPARATE product.product variants, each with its own price.
     * With configure=false the configurator never runs, so linking a turnaround
     * PTAV does nothing — POS just keeps product_variant_ids[0] (Regular). We
     * must therefore pick the matching variant and pass it as `product_id`.
     *
     * Soil Level / Item / Steam Size / Hanger / Type are `no_variant` attributes:
     * they don't create variants, so they go on the line via attribute_value_ids
     * link commands, and their price_extra must be summed manually (configure=false
     * skips the configurator's own price_extra summing).
     */
    async _addServiceProduct(product, svc, svcInstructions, turnaround) {
        const variants = product.product_variant_ids || [];
        const wantExpress = turnaround === "express";
        const soil = String(svcInstructions.soil || "").toLowerCase();

        // PTAV ids that actually define variants (the create_variant attribute).
        const variantValueIds = new Set();
        for (const v of variants) {
            for (const pv of v.product_template_variant_value_ids || []) {
                variantValueIds.add(pv.id);
            }
        }

        // 1) Pick the variant matching the requested turnaround (Express/Regular).
        const variant =
            this._pickTurnaroundVariant(variants, wantExpress, soil) || variants[0] || null;

        // 2) Resolve no_variant attribute lines from the instruction selections.
        const links = [];
        let priceExtra = 0;
        const debug = [];
        for (const line of product.attribute_line_ids || []) {
            const vals = line.product_template_value_ids || [];
            if (!vals.length) continue;
            // Skip the variant-defining attribute — it's handled by product_id.
            if (vals.some((v) => variantValueIds.has(v.id))) continue;

            const attrName = line.attribute_id?.name || line.display_name || "";
            const lowerAttr = attrName.toLowerCase();
            let chosen = null;

            if (lowerAttr.includes("turnaround")) {
                // No-variant turnaround (Press/DWC/Shoe): Regular / Express values
                // with their own price_extra. (WDF's turnaround is a real variant
                // and was already skipped above via variantValueIds.)
                chosen = vals.find(
                    (v) => String(v.name || "").toLowerCase().includes("express") === wantExpress
                );
            } else {
                const field = SERVICE_INSTRUCTIONS[svc]?.find(
                    (f) => f.attr && lowerAttr.includes(f.attr.toLowerCase())
                );
                const selected = field ? svcInstructions[field.key] : null;
                if (selected) {
                    chosen = vals.find(
                        (v) => String(v.name || "").toLowerCase() === String(selected).toLowerCase()
                    );
                }
            }

            if (!chosen) continue; // leave unset rather than forcing a wrong default
            links.push(["link", chosen]);
            priceExtra += chosen.price_extra || 0;
            debug.push(`${attrName}=${chosen.name}`);
        }

        console.info(
            "[laundry_pos] add", product.name,
            "→ variant:", variant?.name, "@", variant?.lst_price,
            "| extras:", debug.join(", ") || "(none)", "| price_extra:", priceExtra
        );

        const vals = {
            product_tmpl_id: product,
            attribute_value_ids: links,
            price_extra: priceExtra,
        };
        if (variant) vals.product_id = variant; // override the default Regular variant
        await this.pos.addLineToCurrentOrder(vals, {}, false);
    },

    /**
     * Choose the product.product variant matching the requested turnaround.
     * Express/Regular is read from the variant's value names; when those names
     * also embed a soil level, prefer the one matching the chosen soil.
     */
    _pickTurnaroundVariant(variants, wantExpress, soil) {
        let best = null;
        let bestScore = -1;
        for (const v of variants) {
            const names = (v.product_template_variant_value_ids || [])
                .map((pv) => String(pv.name || "").toLowerCase());
            const turn = names.find((n) => n.includes("express") || n.includes("regular"));
            if (turn === undefined) continue;                       // no turnaround dimension
            if (turn.includes("express") !== wantExpress) continue; // wrong turnaround
            let score = 1;
            const embedsSoil =
                turn.includes("light") || turn.includes("medium") || turn.includes("heavy");
            if (soil && embedsSoil) {
                score += turn.includes(soil) ? 1 : -1;
            }
            if (score > bestScore) {
                bestScore = score;
                best = v;
            }
        }
        return best;
    },

    // Flash the banner instead of adding the product when setup is skipped
    addProductToOrder(product) {
        const order = this.pos.getOrder();
        const stored = lsLoad(order?.uuid);
        if (
            (order?._laundrySetupProcessed || stored?.status === "skipped") &&
            !order?.laundry_service_type
        ) {
            this._flashBanner();
            return;
        }
        return super.addProductToOrder(product);
    },
});
