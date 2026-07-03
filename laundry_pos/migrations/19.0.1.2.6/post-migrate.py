# Seed the rider tag (is_laundry_rider) on the known riders. Also in the post_init hook
# (__init__.py) so a fresh install / staging refresh applies it too. Still configurable
# afterward via the employee's "Laundry Rider" checkbox.
import logging

_logger = logging.getLogger(__name__)

RIDERS = ("Carl", "Fernan", "Felix", "Jim", "Jeff")


def migrate(cr, version):
    if not version:
        return
    cr.execute(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'hr_employee' AND column_name = 'is_laundry_rider'"
    )
    if not cr.fetchone():
        return
    cr.execute(
        "UPDATE hr_employee SET is_laundry_rider = true "
        "WHERE name IN %s AND is_laundry_rider IS NOT true",
        (RIDERS,),
    )
    _logger.info("laundry_pos 1.2.6: tagged %s riders", cr.rowcount)
