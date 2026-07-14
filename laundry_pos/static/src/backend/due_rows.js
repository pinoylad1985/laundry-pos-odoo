/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";

// Pastel row fill for the POS Orders due-urgency. Odoo's native decoration-* only colours
// TEXT (and was unreliable on this Studio-customised, editable list), so we add our own row
// classes here — keyed off the always-present Due Icon value — and fill them in due_rows.scss.
// The o_laundry_due_* classes only ever land on laundry order rows (rows that have a Due
// Icon), so no view-scoping is needed.
patch(ListRenderer.prototype, {
    getRowClass(record) {
        let cls = super.getRowClass(...arguments);
        const icon = record?.data?.laundry_due_icon || "";
        if (icon.startsWith("🚨")) {
            cls += " o_laundry_due_pd";
        } else if (icon.startsWith("⏰")) {
            cls += " o_laundry_due_soon";
        } else if (icon.startsWith("⏳")) {
            cls += " o_laundry_due_near";
        }
        return cls;
    },
});
