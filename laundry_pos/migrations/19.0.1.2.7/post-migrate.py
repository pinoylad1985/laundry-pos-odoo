# Backfill laundry_service_type from the legacy Studio field x_studio_category (service
# labels only). Also in the post_init hook (__init__.py) so a fresh install / staging
# refresh applies it too. Adjustment / Payment / blank are NOT service types (left empty).
import logging

_logger = logging.getLogger(__name__)

SERVICE_TYPE_BY_CATEGORY = {
    "Drop-off": "dropoff",
    "Drop-off & Delivery": "dropoff_delivery",
    "Pickup & Delivery": "pickup_delivery",
    "Locker": "locker",
    "Self-service": "self_service",
}


def migrate(cr, version):
    if not version:
        return
    cr.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_order'")
    cols = {r[0] for r in cr.fetchall()}
    if "x_studio_category" not in cols or "laundry_service_type" not in cols:
        return
    total = 0
    for label, code in SERVICE_TYPE_BY_CATEGORY.items():
        cr.execute(
            "UPDATE pos_order SET laundry_service_type = %s "
            "WHERE x_studio_category = %s AND laundry_service_type IS NULL",
            (code, label),
        )
        total += cr.rowcount
    _logger.info("laundry_pos 1.2.7: backfilled laundry_service_type on %s orders", total)
