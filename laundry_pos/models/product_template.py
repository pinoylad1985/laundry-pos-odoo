from odoo import models, fields, api


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    laundry_service_type_ids = fields.Many2many(
        comodel_name='laundry.service.type',
        relation='product_laundry_service_type_rel',
        column1='product_id',
        column2='service_type_id',
        string='Available Service Types',
        help='Select which service types this product is available for. '
             'Leave empty to show this product for ALL service types.',
    )
    # Computed char stored for quick access in POS JS (avoids loading the
    # laundry.service.type model into the POS session separately)
    laundry_service_type_codes = fields.Char(
        string='Service Type Codes',
        compute='_compute_laundry_service_type_codes',
        store=True,
    )

    @api.depends('laundry_service_type_ids')
    def _compute_laundry_service_type_codes(self):
        for product in self:
            product.laundry_service_type_codes = ','.join(
                product.laundry_service_type_ids.mapped('code')
            )

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        fields_list.append('laundry_service_type_codes')
        return fields_list
