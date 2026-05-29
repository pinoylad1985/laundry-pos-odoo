# Laundry POS — Claude Code Project Context

## What This Project Is
A custom Odoo 19 Enterprise module (`laundry_pos`) for **laundryx.app** hosted on Cloudpepper.
It adds a laundry-specific workflow to the Point of Sale (POS) module.

## Deployment Pipeline
```
Edit files here (VS Code)
    → Commit & push to GitHub (Source Control panel ⑂ in VS Code)
        → Cloudpepper dashboard → Addons → Update (pulls from GitHub)
            → Odoo → Apps → Laundry POS → ⋮ → Upgrade
                → Test in POS
```
- **GitHub repo:** https://github.com/pinoylad1985/laundry-pos-odoo
- **Live site:** https://laundryx.app
- **Odoo version:** 19 (Enterprise)
- **Python version:** 3.13

## Module Structure
```
laundry_pos/
├── __manifest__.py              # Module definition, asset registration
├── __init__.py
├── models/
│   ├── __init__.py
│   ├── laundry_service_type.py  # laundry.service.type model (5 pre-loaded types)
│   ├── pos_order.py             # Adds laundry_customer_type + laundry_service_type fields
│   └── product_template.py     # Adds laundry_service_type_ids M2M + computed codes field
├── security/
│   └── ir.model.access.csv     # Access rights for laundry.service.type
├── data/
│   └── laundry_service_type_data.xml  # Seeds the 5 service types
├── views/
│   └── product_template_views.xml    # Adds "Laundry Services" tab to product form
└── static/src/
    ├── new_order_modal/
    │   ├── new_order_modal.js   # OWL modal component (2-step wizard)
    │   └── new_order_modal.xml  # Modal template (Bootstrap buttons)
    └── overrides/
        ├── pos_store.js         # Patches addNewOrder to set _needsLaundrySetup flag
        └── product_screen_patch.js  # Patches ProductScreen to show modal + filter products
```

## Key Technical Decisions

### Why pos_order.py has NO _load_pos_data_fields override
`pos.order` in Odoo 19 has no `_load_pos_data_fields` by default, which means it
inherits the mixin default of `[]` (empty list = load ALL fields via read([])).
If we override it and return a specific list, Odoo would ONLY load those fields,
breaking the entire order (missing lines, partner, amount_total, etc.).
Our selection fields (`laundry_customer_type`, `laundry_service_type`) are automatically
included when all fields are read.

### Why product_template.py HAS _load_pos_data_fields override
`product.template` in Odoo 19 DOES have its own explicit field list (30+ fields).
We correctly extend that list by calling super() first, then appending our field.

### Why addNewOrder is synchronous (not async)
`addNewOrder` is called in 10+ places across Odoo without `await`. Making it async
causes the order UUID to be undefined before navigation fires → `/product/undefined` crash.
Instead, we set `order._needsLaundrySetup = true` on the order and let ProductScreen
detect it via `useEffect` and show the modal after the screen loads.

### OWL Patterns Used (Odoo 19)
- `patch(Class.prototype, { ... })` — extends existing classes
- `makeAwaitable(this.dialog, ModalComponent, props)` — shows modal, returns Promise
- `useEffect(() => { effect }, () => [dependency])` — runs when dependency changes
- `super.addNewOrder(...arguments)` — calls original method in patches

## Service Types (pre-loaded data)
| Code | Label |
|------|-------|
| `dropoff` | Drop-off |
| `dropoff_delivery` | Drop-off & Delivery |
| `pickup_delivery` | Pickup & Delivery |
| `locker` | Locker |
| `self_service` | Self-service |

## Current Status ✅

### Working
- Modal appears automatically when a new POS order is opened
- Customer Type selection: New Customer / Returning Customer
- Service Type selection: all 5 options shown
- Skip for now / Continue → buttons
- Product filtering logic written (filters by `laundry_service_type_codes`)
- "Laundry Services" tab on product form for tagging products

### Pending / Not Yet Tested
- **Continue → button flow**: should open PartnerList for customer creation or search
- **Product filtering in POS**: products need to be tagged first (see below)
- **Receipt customization**: parked — user wants to see format first
- **Sync of laundry fields back to server**: `laundry_service_type` set on JS order
  object needs to verify it persists after sync_from_ui

## How to Tag Products (non-technical steps)
1. Odoo → Point of Sale → Products → Products
2. Open a product (e.g. Wash-Dry-Fold)
3. Click the **Laundry Services** tab
4. In "Available for Service Types" select which service types apply
5. Leave blank = product shows for ALL service types
6. Save

## Important Files NOT to Break
- `models/pos_order.py` — do NOT add `_load_pos_data_fields` here
- `static/src/overrides/pos_store.js` — `addNewOrder` must stay synchronous
- `__manifest__.py` — asset glob `laundry_pos/static/src/**/*.js` picks up all JS files

## Odoo 19 POS Architecture Notes
- Frontend framework: OWL 2 (`@odoo/owl`)
- Popup pattern: `makeAwaitable` from `@point_of_sale/app/utils/make_awaitable_dialog`
- POS store: `@point_of_sale/app/services/pos_store` → `PosStore` class
- Product screen: `@point_of_sale/app/screens/product_screen/product_screen`
- Partner list: `@point_of_sale/app/screens/partner_list/partner_list`
- Product filter getter: `get productsToDisplay()` on PosStore (patched by us)
- Asset bundle for POS: `point_of_sale._assets_pos`
- Models loaded via: `_load_pos_data_fields` + `_load_pos_data_read` (pos.load.mixin)
