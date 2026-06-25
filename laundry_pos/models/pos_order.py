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
        service_types = ('dropoff', 'dropoff_delivery', 'pickup_delivery', 'locker', 'self_service')
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
            if order.is_refund or was_refunded:
                # A refund, or an order that has been refunded → Refund (wins over Order).
                order.laundry_secondary_type = 'refund'
            elif is_settle or order.laundry_service_type == 'payment':
                # Created via Settle Order (settles an order/invoice/deposit) or legacy payment tag.
                order.laundry_secondary_type = 'payment'
            elif order.laundry_service_type == 'adjustment':
                # Legacy manual "Adjustment" tag — kept for prior orders.
                order.laundry_secondary_type = 'adjustment'
            elif order.laundry_service_type in service_types:
                order.laundry_secondary_type = 'order'
            else:
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

    # NOTE: No _load_pos_data_fields override needed here.
    # pos.order's default returns [] which means Odoo reads ALL fields via read([]).
    # Our selection fields are automatically included in that full read.
