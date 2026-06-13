from odoo import models, fields, api


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
    # List-view-only dropdown limited to Payment/Adjustment. Cashiers tag
    # non-service orders here; it reads/writes laundry_service_type so the 5
    # modal-driven service types can never be set by hand from the list.
    laundry_manual_category = fields.Selection(
        selection=[
            ('payment', 'Payment'),
            ('adjustment', 'Adjustment'),
        ],
        string='Payment / Adjustment',
        compute='_compute_laundry_manual_category',
        inverse='_inverse_laundry_manual_category',
        store=False,
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

    @api.depends('laundry_service_type')
    def _compute_laundry_manual_category(self):
        for order in self:
            order.laundry_manual_category = (
                order.laundry_service_type
                if order.laundry_service_type in ('payment', 'adjustment')
                else False
            )

    def _inverse_laundry_manual_category(self):
        for order in self:
            if order.laundry_manual_category:
                order.laundry_service_type = order.laundry_manual_category

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

    # NOTE: No _load_pos_data_fields override needed here.
    # pos.order's default returns [] which means Odoo reads ALL fields via read([]).
    # Our selection fields are automatically included in that full read.
