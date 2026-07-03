/** @odoo-module **/

import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { LaundryPinDialog } from "@laundry_pos/backend/laundry_pin_dialog";

// Many2one widget for laundry_staff_id: click the cell -> unlock-style PIN dialog
// ("Wash-Dry-Fold Staff") -> the staff enters their PIN (or picks a name) -> sets the field.
export class StaffPinField extends Component {
    static template = "laundry_pos.StaffPinField";
    static props = { ...standardFieldProps };

    setup() {
        this.dialog = useService("dialog");
    }

    get value() {
        return this.props.record.data[this.props.name] || false;
    }

    open() {
        this.dialog.add(LaundryPinDialog, {
            title: "Wash-Dry-Fold Staff",
            listMethod: "get_laundry_staff",
            checkMethod: "check_laundry_staff",
            onConfirm: (r) =>
                this.props.record.update({
                    [this.props.name]: { id: r.id, display_name: r.name },
                }),
        });
    }
}

registry.category("fields").add("laundry_staff_pin", {
    component: StaffPinField,
    supportedTypes: ["many2one"],
});
