from odoo import models, fields, api
from odoo.exceptions import ValidationError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    laundry_customer_type = fields.Selection(
        selection=[
            ('new', 'New Customer'),
            ('returning', 'Returning Customer'),
        ],
        string='Customer Type',
    )
    laundry_service_type = fields.Selection(
        selection=[
            ('dropoff', 'Drop-off'),
            ('dropoff_delivery', 'Drop-off & Delivery'),
            ('pickup_delivery', 'Pickup & Delivery'),
            ('locker', 'Locker'),
            ('self_service', 'Self-service'),
            # Non-service categories — set via the list-view dropdown / legacy
            # x_studio_category, NOT offered in the New Order modal.
            ('payment', 'Payment'),
            ('adjustment', 'Adjustment'),
        ],
        string='Service Type',
    )
    # Coarse classification for reporting: Order (a real service sale) /
    # Payment (created via Settle Order) / Refund (a refund or a refunded order).
    # Refund wins over Order, so a service order that gets refunded flips to Refund.
    laundry_secondary_type = fields.Selection(
        selection=[
            ('order', 'Order'),
            ('payment', 'Payment'),
            ('adjustment', 'Adjustment'),
            ('refund', 'Refund'),
        ],
        string='Secondary Type',
        compute='_compute_laundry_secondary_type',
        store=True,
    )

    # --- New Order details, set from the POS modal submit (see
    # static/src/overrides/product_screen_patch.js) so they persist & are reportable. ---
    laundry_turnaround = fields.Selection(
        selection=[
            ('express', 'Express'),
            ('regular', 'Regular'),
        ],
        string='Turnaround (TAT)',
    )
    laundry_services = fields.Char(string='Laundry Services')  # comma-joined service names
    laundry_claim_datetime = fields.Datetime(string='Claim Date & Time')
    laundry_pickup_datetime = fields.Datetime(string='Pickup Date & Time')
    laundry_delivery_datetime = fields.Datetime(string='Delivery Date & Time')

    # --- Server-derived (no POS involvement) ---
    laundry_due_datetime = fields.Datetime(
        string='Cashier Due',
        compute='_compute_laundry_due_datetime',
        store=True,
    )
    # Computed-stored (NOT related) on purpose: a stored `related` field is
    # writable and would push values back to res.partner — POS could wipe the
    # customer's phone on order sync. A computed field has no inverse, so it's
    # one-way (partner -> order) and a stale value sent by POS is corrected on
    # the next recompute.
    laundry_customer_phone = fields.Char(
        string='Customer Phone',
        compute='_compute_laundry_customer_phone',
        store=True,
    )
    laundry_customer_address = fields.Char(
        string='Customer Address',
        compute='_compute_laundry_customer_address',
        store=True,
    )

    # --- Back-office workflow fields (migrating off the Studio x_studio_* equivalents;
    # selection values mirror the Studio fields so legacy data copies across 1:1). ---
    # Legacy free-text staff name (migrated from x_studio_staff); superseded by the
    # employee link below. Kept for history — it holds names with no matching employee
    # (e.g. Kate). Not shown in the views.
    laundry_staff = fields.Selection(
        selection=[
            ('Maan', 'Maan'), ('Jane', 'Jane'), ('Rose', 'Rose'), ('Yumi', 'Yumi'),
            ('Beth', 'Beth'), ('Nita', 'Nita'), ('Emy', 'Emy'),
            ('Ruby', 'Ruby'), ('Tesheil', 'Tesheil'), ('Mark', 'Mark'),
            ('Jepoy', 'Jepoy'), ('Mona', 'Mona'), ('Tricia', 'Tricia'),
        ],
        string='Staff (legacy name)',
    )
    # The assigned cashier. Picker shows ACTIVE employees (archive resignees to hide
    # them while keeping history). Editing it on the form requires the cashier's POS PIN.
    laundry_staff_id = fields.Many2one('hr.employee', string='Staff')
    laundry_folding_time = fields.Datetime(string='Folding Time')
    laundry_status = fields.Selection(
        selection=[
            ('Not Started', 'Not Started'),
            ('In Process', 'In Process'),
            ('Folded', 'Folded'),
        ],
        string='Status',
        default='Not Started',
    )
    # Rider who signed off on a Pickup & Delivery / Locker order at payment (POS PIN gate).
    laundry_rider = fields.Char(string='Rider')

    @api.depends('laundry_delivery_datetime', 'laundry_claim_datetime')
    def _compute_laundry_due_datetime(self):
        # Legacy fallback to the ex-Studio field for old records. Guarded by a
        # field-existence check so the module stays installable without Studio;
        # x_studio_due_datetime is intentionally NOT in @api.depends (it may not
        # exist, and legacy values don't change).
        has_legacy = 'x_studio_due_datetime' in self._fields
        for order in self:
            legacy = order.x_studio_due_datetime if has_legacy else False
            # Delivery time wins (delivery-type services); else claim; else legacy.
            order.laundry_due_datetime = (
                order.laundry_delivery_datetime
                or order.laundry_claim_datetime
                or legacy
            )

    @api.depends('is_refund', 'laundry_service_type', 'lines.refund_orderline_ids',
                 'lines.settled_order_id', 'lines.settled_invoice_id', 'lines.product_id')
    def _compute_laundry_secondary_type(self):
        # Legacy orders carry their category on the Studio field x_studio_category
        # ("Payment" / "Adjustment" / the 5 service-type labels). Read it when present
        # (guarded — it may not exist without Studio) but DON'T depend on it: it's
        # historical data that never changes.
        has_studio_cat = 'x_studio_category' in self._fields
        service_codes = ('dropoff', 'dropoff_delivery', 'pickup_delivery', 'locker', 'self_service')
        service_labels = ('Drop-off', 'Drop-off & Delivery', 'Pickup & Delivery', 'Locker', 'Self-service')
        for order in self:
            deposit = order.config_id.deposit_product_id
            is_settle = any(
                line.settled_order_id or line.settled_invoice_id
                or (deposit and line.product_id == deposit)
                for line in order.lines
            )
            # "Refunded" = some line of this order has refund lines pointing at it. We depend
            # on lines.refund_orderline_ids (not the NON-stored refund_orders_count) so the
            # stored value actually recomputes when a refund is created against this order.
            was_refunded = any(line.refund_orderline_ids for line in order.lines)
            studio_cat = order.x_studio_category if has_studio_cat else False
            if order.is_refund or was_refunded:
                # A refund, or an order that has been refunded → Refund (wins over all).
                order.laundry_secondary_type = 'refund'
            elif is_settle or order.laundry_service_type == 'payment' or studio_cat == 'Payment':
                # Settle Order (new) or a Payment tag (new or legacy Studio).
                order.laundry_secondary_type = 'payment'
            elif order.laundry_service_type == 'adjustment' or studio_cat == 'Adjustment':
                # Adjustment (new or legacy Studio) — kept for prior orders.
                order.laundry_secondary_type = 'adjustment'
            elif order.laundry_service_type in service_codes or studio_cat in service_labels:
                # Has a real service type (new module or legacy Studio label) → a sale.
                order.laundry_secondary_type = 'order'
            else:
                # No category at all → leave blank (uncategorized).
                order.laundry_secondary_type = False

    @api.depends('partner_id.phone')
    def _compute_laundry_customer_phone(self):
        for order in self:
            order.laundry_customer_phone = order.partner_id.phone or False

    @api.depends('partner_id.street', 'partner_id.street2')
    def _compute_laundry_customer_address(self):
        for order in self:
            p = order.partner_id
            order.laundry_customer_address = (
                " ".join(filter(None, [p.street, p.street2])).strip() or False
            )

    def action_laundry_set_staff(self):
        """Open the PIN-gated wizard to set Staff / Folding Time on this order."""
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Set Staff / Folding Time",
            "res_model": "laundry.staff.pin.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_order_id": self.id,
                "default_staff_id": self.laundry_staff_id.id,
                "default_folding_time": self.laundry_folding_time,
            },
        }

    @api.model
    def get_laundry_riders(self):
        """Active employees tagged as riders — for the POS sign-off pills."""
        riders = self.env["hr.employee"].sudo().search([("is_laundry_rider", "=", True)])
        return [{"id": r.id, "name": r.name} for r in riders]

    @api.model
    def check_laundry_rider(self, pin, rider_id=False):
        """Authenticate a rider like the register unlock: with rider_id, verify THAT rider's
        PIN; otherwise find the tagged rider whose PIN matches (type-PIN-to-identify).
        Returns {'id', 'name'} on success, else False."""
        pin = (pin or "").strip()
        Emp = self.env["hr.employee"].sudo()
        if rider_id:
            emp = Emp.browse(int(rider_id))
            ok = emp.exists() and emp.is_laundry_rider and emp.pin and emp.pin == pin
            return {"id": emp.id, "name": emp.name} if ok else False
        emp = Emp.search([("is_laundry_rider", "=", True), ("pin", "=", pin)], limit=1)
        return {"id": emp.id, "name": emp.name} if emp else False

    @api.constrains("laundry_folding_time")
    def _check_laundry_folding_not_future(self):
        now = fields.Datetime.now()
        for order in self:
            if order.laundry_folding_time and order.laundry_folding_time > now:
                raise ValidationError("Folding Time cannot be in the future.")

    # NOTE: No _load_pos_data_fields override needed here.
    # pos.order's default returns [] which means Odoo reads ALL fields via read([]).
    # Our selection fields are automatically included in that full read.


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    # The real weighed value the cashier enters in the WDF configurator, shown
    # as-is (like a variant attribute) in the cart/receipt. The line QTY is the
    # billed value (this rounded UP to the nearest 0.5 kg).
    laundry_actual_weight = fields.Float(string='Actual Weight (KG)')

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if 'laundry_actual_weight' not in fields_list:
            fields_list.append('laundry_actual_weight')
        return fields_list
