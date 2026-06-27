# Force a one-time recompute of laundry_secondary_type across all orders. The field is
# stored, so the legacy-x_studio_category classification I added later never applied to
# historical orders (a code change doesn't auto-recompute stored fields). Recompute in
# batches so the full logic (incl. x_studio_category -> order/payment/adjustment) lands.
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    if not version:
        return
    from odoo import api, SUPERUSER_ID
    env = api.Environment(cr, SUPERUSER_ID, {})
    Order = env["pos.order"]
    if "laundry_secondary_type" not in Order._fields:
        return
    ids = Order.search([]).ids
    for i in range(0, len(ids), 2000):
        batch = Order.browse(ids[i:i + 2000])
        batch._compute_laundry_secondary_type()
        batch.flush_recordset(["laundry_secondary_type"])
        env.invalidate_all()  # free the lines/cache loaded for this batch
    _logger.info("laundry_pos 1.2.2: recomputed laundry_secondary_type on %s orders", len(ids))
