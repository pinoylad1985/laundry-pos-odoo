/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { partnerMatchesQuery, buildPartnerSearchDomain } from "@laundry_pos/utils/partner_search";

/**
 * Make the native "Choose customer" picker (the Customer control button) use the
 * same multi-word, any-field, order-independent search as the rest of the module:
 *  - getPartners: client-side filter over already-loaded customers.
 *  - getNewPartners: server search (Enter / scroll) with a multi-word domain so
 *    not-yet-loaded customers are found too.
 */
patch(PartnerList.prototype, {
    getPartners(partners) {
        const query = this.state.query?.trim();
        if (!query) {
            return super.getPartners(partners);
        }
        return partners.filter((p) => partnerMatchesQuery(p, query));
    },

    async getNewPartners() {
        let domain = [];
        const offset = this.globalState.offsetBySearch[this.state.query] || 0;
        if (offset > this.loadedPartnerIds.size) {
            return [];
        }
        if (this.state.query) {
            domain = buildPartnerSearchDomain(this.state.query);
        }
        try {
            this.state.loading = true;
            const result = await this.pos.data.callRelated("res.partner", "get_new_partner", [
                this.pos.config.id,
                domain,
                offset,
            ]);
            this.globalState.offsetBySearch[this.state.query] =
                offset + (result["res.partner"].length || 100);
            for (const partner of result["res.partner"]) {
                if (!this.loadedPartnerIds.has(partner.id)) {
                    this.loadedPartnerIds.add(partner.id);
                    this.state.loadedPartners.push(partner);
                }
            }
            return result["res.partner"];
        } catch {
            return [];
        } finally {
            this.state.loading = false;
        }
    },
});
