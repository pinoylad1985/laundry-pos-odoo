from odoo import fields, models


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    is_laundry_rider = fields.Boolean(
        string="Laundry Rider",
        help="Delivery rider — appears in the rider sign-off at payment for "
             "Pickup & Delivery / Locker orders (signs off with their POS PIN).",
    )
