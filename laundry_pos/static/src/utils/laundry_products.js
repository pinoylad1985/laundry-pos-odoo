/** @odoo-module **/

// Shared helpers to recognise the 4 laundry service products on the live POS
// order. Used by the New Order modal (pills), the order-summary click patch,
// and the payment block. Everything works off live pos.models / line records
// (no hardcoded ids, no JS-only flags) so it stays correct across reloads.

import { LAUNDRY_MENU } from "@laundry_pos/utils/laundry_instructions";

// Leading word boundary so "press" never matches "(express)" items.
function _matches(name, kw) {
    const k = String(kw).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${k}`).test(String(name || "").toLowerCase());
}

// Live product.template for a menu code (active + available in POS).
export function findLaundryProduct(pos, code) {
    const item = LAUNDRY_MENU.find((m) => m.code === code);
    if (!item) return null;
    const all = pos.models["product.template"]?.getAll() ?? [];
    return all.find(
        (p) =>
            p.active !== false &&
            p.available_in_pos !== false &&
            _matches(p.name, item.match)
    );
}

// Menu code for a given product.template, or null if it isn't a laundry service.
export function laundryCodeForProduct(productTmpl) {
    if (!productTmpl) return null;
    const item = LAUNDRY_MENU.find((m) => _matches(productTmpl.name, m.match));
    return item ? item.code : null;
}

// Format a stored "HH:00" 24h value as 12-hour with AM/PM (e.g. "9:00 AM").
export function fmtTime12(hour) {
    if (!hour) return "";
    const [h, m] = String(hour).split(":");
    const hh = parseInt(h, 10);
    if (isNaN(hh)) return hour;
    const ampm = hh < 12 ? "AM" : "PM";
    const disp = hh % 12 === 0 ? 12 : hh % 12;
    return `${disp}:${m || "00"} ${ampm}`;
}

// "YYYY-MM-DD" + "HH:00" → "YYYY-MM-DD 9:00 AM"
export function fmtDateTime12(date, hour) {
    if (!date) return "";
    const t = fmtTime12(hour);
    return t ? `${date} ${t}` : date;
}

// Replace any turnaround value in `selectedIds` with the one matching `tat`
// ("express"/"regular"). The schedule (TAT) — not the cashier — decides it.
export function withTatTurnaround(productTemplate, selectedIds, tat) {
    if (!tat) return [...selectedIds];
    let ids = [...selectedIds];
    for (const line of productTemplate.attribute_line_ids || []) {
        if (!String(line.attribute_id?.name || "").startsWith("Turnaround")) continue;
        const vals = line.product_template_value_ids || [];
        const valIds = vals.map((v) => v.id);
        ids = ids.filter((id) => !valIds.includes(id));
        const match = vals.find(
            (v) => String(v.name || "").toLowerCase().includes("express") === (tat === "express")
        );
        if (match) ids.push(match.id);
        break;
    }
    return ids;
}

// Build addLineToCurrentOrder vals for a product configured with `selectedIds`:
// resolve the create_variant="always" product.product, link all chosen values,
// and sum price_extra for the no_variant ones only.
export function buildConfiguredLineVals(pos, productTemplate, selectedIds) {
    const ptavModel = pos.models["product.template.attribute.value"];
    const variants = productTemplate.product_variant_ids || [];
    const variantValueIds = new Set();
    for (const v of variants) {
        for (const pv of v.product_template_variant_value_ids || []) variantValueIds.add(pv.id);
    }
    let variant = variants.find((v) => {
        const vv = (v.product_template_variant_value_ids || []).map((pv) => pv.id);
        return vv.length && vv.every((id) => selectedIds.includes(id));
    });
    variant = variant || variants[0] || null;

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
    return vals;
}

// A laundry line whose product still has options the cashier hasn't chosen.
export function lineNeedsConfig(line) {
    const tmpl = line?.product_id?.product_tmpl_id;
    if (!laundryCodeForProduct(tmpl)) return false;
    const hasAttrs = (tmpl?.attribute_line_ids?.length || 0) > 0;
    return hasAttrs && !(line?.attribute_value_ids?.length);
}
