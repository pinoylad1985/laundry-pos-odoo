"""One-time backfill of the new laundry fields from the legacy Studio fields.

Runs on Upgrade to 1.1.0 (only where the module is installed, e.g. staging).
No-ops safely if the Studio fields are absent.
  - laundry_service_type <- x_studio_category  (blanks only)
  - laundry_due_datetime <- recompute (now includes the x_studio_due_datetime fallback)
"""
from odoo import api, SUPERUSER_ID

CATEGORY_MAP = {
    "Drop-off": "dropoff",
    "Drop-off & Delivery": "dropoff_delivery",
    "Pickup & Delivery": "pickup_delivery",
    "Locker": "locker",
    "Self-service": "self_service",
    "Payment": "payment",
    "Adjustment": "adjustment",
}


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    Order = env["pos.order"]

    # laundry_service_type <- x_studio_category (fill blanks only; plain field, durable)
    if "x_studio_category" in Order._fields:
        for order in Order.search([("laundry_service_type", "=", False)]):
            target = CATEGORY_MAP.get(order.x_studio_category)
            if target:
                order.laundry_service_type = target

    # laundry_due_datetime: force recompute so old records pick up the new
    # x_studio_due_datetime fallback baked into the compute.
    orders = Order.search([])
    env.add_to_compute(Order._fields["laundry_due_datetime"], orders)
    orders.flush_recordset(["laundry_due_datetime"])
