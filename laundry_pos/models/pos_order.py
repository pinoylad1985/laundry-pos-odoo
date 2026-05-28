from odoo import models, fields


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
        ],
        string='Service Type',
    )
    # NOTE: No _load_pos_data_fields override needed here.
    # pos.order's default returns [] which means Odoo reads ALL fields via read([]).
    # Our selection fields are automatically included in that full read.
