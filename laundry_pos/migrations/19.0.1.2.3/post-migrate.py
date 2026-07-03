# Link the new laundry_staff_id (hr.employee) from the legacy staff NAME (x_studio_staff),
# matched by employee name (including archived employees, so resigned staff still link to
# their history). Names with no employee record stay blank. Idempotent (only fills empties).
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    if not version:
        return
    cr.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'pos_order'")
    cols = {r[0] for r in cr.fetchall()}
    if "x_studio_staff" not in cols or "laundry_staff_id" not in cols:
        return
    cr.execute(
        """
        UPDATE pos_order o SET laundry_staff_id = (
            SELECT e.id FROM hr_employee e WHERE e.name = o.x_studio_staff ORDER BY e.id LIMIT 1
        )
        WHERE o.x_studio_staff IS NOT NULL AND o.laundry_staff_id IS NULL
          AND EXISTS (SELECT 1 FROM hr_employee e2 WHERE e2.name = o.x_studio_staff)
        """
    )
    _logger.info("laundry_pos 1.2.3: linked laundry_staff_id on %s orders", cr.rowcount)
