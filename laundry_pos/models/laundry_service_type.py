from odoo import models, fields


class LaundryServiceType(models.Model):
    _name = 'laundry.service.type'
    _description = 'Laundry Service Type'
    _order = 'sequence, name'

    name = fields.Char(string='Name', required=True, translate=True)
    code = fields.Char(string='Code', required=True)
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(default=True)
