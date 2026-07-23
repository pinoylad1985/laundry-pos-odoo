/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

// Refund payment lock: a refund must be tendered EXACTLY like the original order — same
// payment method(s) and amount(s), negated (partial refunds are disabled, so the refund
// mirrors the original 1:1). The refund order carries `_laundryLockedPayments`, set by
// ticket_screen_patch.onDoRefund from pos.order.get_laundry_refund_payments. We pre-fill
// those payment lines and block the cashier from adding/removing/re-amounting them.
//
// EVERYTHING here is scoped to locked refund orders — normal (non-refund) payments run
// through `super` untouched.
let _laundryMirroring = false;

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        onMounted(() => this._laundryMirrorRefundPayments());
    },

    get _laundryLockedPayments() {
        const locked = this.currentOrder?._laundryLockedPayments;
        return Array.isArray(locked) && locked.length ? locked : null;
    },

    // Pre-fill the refund's payment lines to mirror the original tender(s), negated.
    _laundryMirrorRefundPayments() {
        const locked = this._laundryLockedPayments;
        const order = this.currentOrder;
        if (!locked || !order || order._laundryPaymentsMirrored) {
            return;
        }
        order._laundryPaymentsMirrored = true;
        const methods = this.payment_methods_from_config || [];
        _laundryMirroring = true;
        try {
            for (const p of locked) {
                const method = methods.find((m) => m.id === p.payment_method_id);
                if (!method) {
                    continue;
                }
                this.addNewPaymentLine(method);
                const line = order.get_selected_paymentline?.();
                if (line && typeof line.set_amount === "function") {
                    line.set_amount(-Math.abs(p.amount)); // refund = negated original
                }
            }
        } finally {
            _laundryMirroring = false;
        }
    },

    // ---- Lock: block manual add / delete / amount edits on a locked refund. ----
    addNewPaymentLine(paymentMethod) {
        if (this._laundryLockedPayments && !_laundryMirroring) {
            return false; // locked — the mirrored tender is already set
        }
        return super.addNewPaymentLine(...arguments);
    },

    deletePaymentLine(uuid) {
        if (this._laundryLockedPayments) {
            return; // locked — can't remove the mirrored tender
        }
        return super.deletePaymentLine(...arguments);
    },

    updateSelectedPaymentline(amount) {
        if (this._laundryLockedPayments) {
            return; // locked — amount is fixed to the original
        }
        return super.updateSelectedPaymentline(...arguments);
    },
});
