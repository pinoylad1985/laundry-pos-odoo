from . import models


def _laundry_post_init(env):
    """Copy the legacy Studio workflow fields onto the new module fields on a FRESH
    install. Migrations only run on UPGRADE, so this covers installing laundry_pos onto a
    database that has the x_studio_* fields but not the module yet — e.g. a staging refresh
    from prod (which doesn't have laundry_pos). Values map 1:1; only empty targets are filled.
    """
    cr = env.cr
    cr.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_order'")
    cols = {r[0] for r in cr.fetchall()}
    mapping = {
        "x_studio_staff": "laundry_staff",
        "x_studio_folding_time": "laundry_folding_time",
        "x_studio_status": "laundry_status",
    }
    sets, where = [], []
    for src, dst in mapping.items():
        if src in cols and dst in cols:
            sets.append("%s = COALESCE(%s, %s)" % (dst, src, dst))
            where.append("%s IS NOT NULL" % src)
    if sets:
        cr.execute("UPDATE pos_order SET %s WHERE %s" % (", ".join(sets), " OR ".join(where)))
