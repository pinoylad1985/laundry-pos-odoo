from odoo import models, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config):
        # Load partner tags so the receipt can display them.
        models_list = super()._load_pos_data_models(config)
        if 'res.partner.category' not in models_list:
            models_list = models_list + ['res.partner.category']
        return models_list
