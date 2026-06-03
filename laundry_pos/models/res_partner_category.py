from odoo import models, api


class ResPartnerCategory(models.Model):
    # Make partner tags available in the POS so they can be shown on the receipt.
    _name = 'res.partner.category'
    _inherit = ['res.partner.category', 'pos.load.mixin']

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'color']
