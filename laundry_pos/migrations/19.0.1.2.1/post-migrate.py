# Re-run of the 1.2.0 copy with the corrected COALESCE order (Studio value wins).
# The original 1.2.0 used COALESCE(dst, src), which kept laundry_status's default
# ('Not Started') instead of the legacy x_studio_status — so on databases that already
# ran 1.2.0 (e.g. staging), this restores the real statuses. Idempotent for staff/folding.
import logging

_logger = logging.getLogger(__name__)

MAP = {
    "x_studio_staff": "laundry_staff",
    "x_studio_folding_time": "laundry_folding_time",
    "x_studio_status": "laundry_status",
}


def migrate(cr, version):
    if not version:
        return
    cr.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_order'")
    cols = {r[0] for r in cr.fetchall()}
    sets, where = [], []
    for src, dst in MAP.items():
        if src in cols and dst in cols:
            sets.append("%s = COALESCE(%s, %s)" % (dst, src, dst))
            where.append("%s IS NOT NULL" % src)
    if not sets:
        return
    cr.execute("UPDATE pos_order SET %s WHERE %s" % (", ".join(sets), " OR ".join(where)))
    _logger.info("laundry_pos 1.2.1: re-copied x_studio_* -> laundry_* on %s orders", cr.rowcount)
