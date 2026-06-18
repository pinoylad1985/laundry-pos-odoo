/** @odoo-module **/

/**
 * Multi-word, any-field, order-independent partner search.
 *
 * The query is split into words; a partner matches when EVERY word appears in at
 * least one of its fields (name / address / phone / etc.). Word order is
 * irrelevant, and more words = a narrower result. Used by every partner search in
 * the module (New Order modal, Orders customer search, and the native picker).
 */

// Fields concatenated for the CLIENT-side check (must be loaded in POS).
const HAYSTACK_FIELDS = [
    "name", "parent_name", "phone", "mobile",
    "street", "street2", "city", "zip", "vat", "email", "barcode",
    "pos_contact_address",
];

export function partnerHaystack(partner) {
    return HAYSTACK_FIELDS.map((f) => partner?.[f] || "").join(" ").toLowerCase();
}

export function partnerMatchesQuery(partner, query) {
    const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
        return false;
    }
    const hay = partnerHaystack(partner);
    return words.every((w) => hay.includes(w));
}

// Fields used for the SERVER-side domain (each word must match one of them).
const DOMAIN_FIELDS = [
    "complete_name", "phone_mobile_search", "barcode", "vat",
    "street", "street2", "zip", "city", "email",
];

/**
 * Build an Odoo domain that requires EACH word to match some field:
 *   AND( OR(field ilike word1 …), OR(field ilike word2 …), … )
 */
export function buildPartnerSearchDomain(query) {
    const words = String(query || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
        return [];
    }
    const perWord = words.map((w) => [
        ...Array(DOMAIN_FIELDS.length - 1).fill("|"),
        ...DOMAIN_FIELDS.map((f) => [f, "ilike", w]),
    ]);
    return [...Array(perWord.length - 1).fill("&"), ...perWord.flat()];
}
