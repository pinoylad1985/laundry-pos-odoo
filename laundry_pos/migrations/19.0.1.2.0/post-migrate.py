# One-time copy of the legacy Studio workflow fields onto the new module fields
# (runs on upgrade to 1.2.0). The new Selection keys mirror the Studio labels, so a
# bulk SQL COALESCE is enough — and it only fills targets that are still empty, so it
# never clobbers a value already set on the new field.
import logging

_logger = logging.getLogger(__name__)

# Studio field  ->  new module field
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
            sets.append("%s = COALESCE(%s, %s)" % (dst, dst, src))
            where.append("%s IS NOT NULL" % src)
    if not sets:
        _logger.info("laundry_pos 1.2.0: no Studio columns present — nothing to migrate")
        return
    cr.execute("UPDATE pos_order SET %s WHERE %s" % (", ".join(sets), " OR ".join(where)))
    _logger.info("laundry_pos 1.2.0: copied x_studio_* -> laundry_* on %s orders", cr.rowcount)
