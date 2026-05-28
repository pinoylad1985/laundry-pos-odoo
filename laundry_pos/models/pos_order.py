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
        ],
        string='Service Type',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        fields_list.extend(['laundry_customer_type', 'laundry_service_type'])
        return fields_list
