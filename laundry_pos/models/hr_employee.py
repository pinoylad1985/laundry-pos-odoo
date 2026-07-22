from odoo import fields, models


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    is_laundry_rider = fields.Boolean(
        string="Laundry Rider",
        help="Delivery rider — appears in the rider sign-off at payment for "
             "Pickup & Delivery / Locker orders (signs off with their POS PIN).",
    )
    is_laundry_manager = fields.Boolean(
        string="Laundry Manager",
        help="Manager — may approve a refund WITHOUT a rebooked order (with their "
             "POS PIN + a reason) in the refund control gate.",
    )
