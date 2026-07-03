# 1) Link renamed staff to the right employee (Jepoy -> Jeff). 2) Archive resigned
# employees (off the Staff picker; their order history stays linked). Both are also in the
# post_init hook (__init__.py) so a fresh install / staging refresh applies them too.
import logging

_logger = logging.getLogger(__name__)

ALIASES = {"Jepoy": "Jeff"}
RESIGNED = ("Lester", "Joey", "Kate", "Lucy", "Lita", "Mona")


def migrate(cr, version):
    if not version:
        return
    cr.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_order'")
    cols = {r[0] for r in cr.fetchall()}
    if "x_studio_staff" in cols and "laundry_staff_id" in cols:
        for old_name, emp_name in ALIASES.items():
            cr.execute(
                """
                UPDATE pos_order o SET laundry_staff_id =
                    (SELECT id FROM hr_employee WHERE name = %s ORDER BY id LIMIT 1)
                WHERE o.x_studio_staff = %s AND o.laundry_staff_id IS NULL
                  AND EXISTS (SELECT 1 FROM hr_employee WHERE name = %s)
                """,
                (emp_name, old_name, emp_name),
            )
            _logger.info("laundry_pos 1.2.4: aliased %s -> %s on %s orders", old_name, emp_name, cr.rowcount)
    cr.execute(
        "UPDATE hr_employee SET active = false WHERE name IN %s AND active = true",
        (RESIGNED,),
    )
    _logger.info("laundry_pos 1.2.4: archived %s resigned employees", cr.rowcount)
