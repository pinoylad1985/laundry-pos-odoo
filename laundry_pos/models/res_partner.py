from odoo import models, fields, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    # Comma-joined tag names, computed on the partner itself so the POS receipt
    # can show them WITHOUT loading the res.partner.category model. Relational
    # loading only pulls categories referenced by pre-loaded partners, so tags
    # on customers fetched on-demand (cashier search) would otherwise be missing.
    pos_tag_names = fields.Char(
        string="POS Tag Names",
        compute="_compute_pos_tag_names",
    )

    @api.depends('category_id', 'category_id.name')
    def _compute_pos_tag_names(self):
        for partner in self:
            partner.pos_tag_names = ", ".join(partner.category_id.mapped('name'))

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if 'pos_tag_names' not in fields_list:
            fields_list.append('pos_tag_names')
        return fields_list
