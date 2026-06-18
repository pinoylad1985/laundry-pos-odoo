# Laundry POS — Claude Code Project Context

## What This Project Is
A custom Odoo 19 Enterprise module (`laundry_pos`) for **laundryx** that adds a laundry-specific
workflow to the Point of Sale (POS). It is self-hosted on a single VPS via **Docker Compose** (production + staging — see below).

> **Full feature/technical reference:** [docs/laundry-pos-customizations.html](docs/laundry-pos-customizations.html)
> documents every customization in detail. End-user guide: [docs/laundry-pos-module-guide.html](docs/laundry-pos-module-guide.html).
> Keep those in sync when behavior changes.

## Deployment
Self-hosted on a single VPS via **Docker Compose** (Odoo 19 + Postgres + Caddy reverse proxy with HTTPS),
fronted by Cloudflare.
- **Production** — `main` branch → `odoo.laundryx.app` (database `laundryx`).
- **Staging** — `staging` branch → `staging.laundryx.app` (database `laundryx_staging`).

Promotion flow: work → push to `staging` → it deploys to staging → test → open a PR to merge `staging` → `main`
→ run the production deploy (backs up first, pulls `main`, restarts, upgrades the module). After a deploy, in
Odoo: **Apps → Update Apps List → Upgrade Laundry POS**.

- **GitHub repo:** https://github.com/pinoylad1985/laundry-pos-odoo
- **Odoo version:** 19 (Enterprise) · **Python:** 3.13 · **Frontend:** OWL 2

## Module Structure
```
laundry_pos/
├── __manifest__.py                  # depends: point_of_sale; assets glob static/src/**/*.{scss,js,xml}
├── models/
│   ├── pos_order.py                 # laundry_* fields on pos.order (+ computed due/phone/address)
│   ├── res_partner.py               # pos_tag_names computed char (for receipt tags)
│   └── laundry_service_type.py      # laundry.service.type catalog model (5 seeded types)
├── security/ir.model.access.csv
├── data/
│   ├── laundry_service_type_data.xml   # seeds the 5 service types
│   └── demangle_server_action.xml      # one-time Contacts maintenance action (not POS runtime)
└── static/src/
    ├── utils/
    │   ├── laundry_instructions.js  # LAUNDRY_MENU: 4 service products matched BY NAME
    │   ├── laundry_products.js      # name matching, TAT helpers, configured-line vals
    │   └── laundry_storage.js       # localStorage per-order persistence (keyed by uuid)
    ├── new_order_modal/             # 4-step modal (customer / services / type / schedule)
    └── overrides/
        ├── pos_store.js             # addNewOrder flag, selectPartner block, no-merge, printReceipt, pay gates
        ├── product_screen_patch.*   # opens modal, banner, rehydrate, addProduct block
        ├── order_display_patch.js   # fixed line order (WDF→Press→DWC→Shoe)
        ├── order_summary_patch.js   # tap a laundry line → fresh configurator
        ├── order_line_patch.*       # per-line receipt attributes, WDF/Press count lines
        ├── pos_order_line_patch.js  # qty rules (DWC/Shoe=1, WDF per-kg, Press>1)
        ├── product_configurator_popup_patch.* # pre-fill, TAT lock, crash guard
        ├── order_receipt_patch.*    # multi-copy thermal receipt
        ├── receipt_header_patch.* + receipt_header.xml + laundry_receipt.scss
        └── opening_control_popup_patch.* / closing_popup_patch.* / cash_control.scss  # cash control
```

> **No `product_template.py` and no product views.** The old "Laundry Services tab" / `laundry_service_type_ids`
> M2M / `productsToDisplay` filtering were **removed**. Products are now recognised by NAME (Wash-Dry-Fold,
> Dry/Wet Clean, Shoe Clean, Press) via `LAUNDRY_MENU`.

## Key Technical Decisions
- **No `_load_pos_data_fields` override on `pos.order`** — its default returns `[]` (read ALL fields), so our
  selection fields load automatically. Overriding it to a specific list would drop lines/partner/amounts.
- **Order fields are computed-stored, NOT `related`** — a stored `related` is writable and would push values back to
  `res.partner` (POS could wipe the customer's phone on sync). Computed = one-way (partner → order).
- **`addNewOrder` stays synchronous** — it's called 10+ places without `await`; async leaves `order.uuid` undefined
  before navigation → `/product/undefined` crash. We set `order._needsLaundrySetup` and let ProductScreen react.
- **Products matched by NAME, not IDs/tags** — survives DB restores and re-seeding; no per-product config needed.
- **localStorage for laundry meta** — the `laundry_*` JS fields aren't server-synced, so they're rehydrated across reloads.
- **Turnaround (TAT) is computed from the schedule and locked** — not a free cashier choice; keeps lines/receipt consistent.
- **Configurator crash guard** — `initAttributes()` pre-seeds `state.attributes` for every value's `attribute_id` so
  malformed products (e.g. after a DB restore) don't crash the popup.

## Service Types (seeded data + frontend list)
| Code | Label |
|------|-------|
| `dropoff` | Drop-off |
| `dropoff_delivery` | Drop-off & Delivery |
| `pickup_delivery` | Pickup & Delivery |
| `locker` | Locker |
| `self_service` | Self-service |

## Service Products (matched by name)
| Code | Name contains | Quantity behavior |
|------|---------------|-------------------|
| `wdf` | Wash-Dry-Fold | per-KG, editable; min weight at payment (6kg single / 4kg each multi) |
| `dwc` | Dry/Wet Clean | locked to 1; long turnaround |
| `shoe` | Shoe Clean | locked to 1; long turnaround |
| `press` | Press | may exceed 1 |

## Important Files NOT to Break
- `models/pos_order.py` — do NOT add `_load_pos_data_fields`; keep order fields computed (not related).
- `static/src/overrides/pos_store.js` — `addNewOrder` must stay synchronous.
- `__manifest__.py` — asset glob `laundry_pos/static/src/**/*` picks up all SCSS/JS/XML.

## ⚠️ Re-check on every Odoo upgrade
- `static/src/overrides/partner_search_patch.js` — `getNewPartners` is a **FULL COPY** of core
  `PartnerList.getNewPartners` (not a `super` extension), because the multi-word search domain has to be
  injected mid-method. It will **not** inherit future core changes. On each Odoo upgrade, diff it against the
  new core method and re-sync if core changed. (Everything else in the module extends via `super`, so it
  auto-inherits core changes — this one file is the exception.)

## Odoo 19 POS Architecture Notes
- Popup pattern: `makeAwaitable` from `@point_of_sale/app/utils/make_awaitable_dialog`
- POS store: `@point_of_sale/app/services/pos_store` → `PosStore`
- Product screen: `@point_of_sale/app/screens/product_screen/product_screen`
- Configurator: `@point_of_sale/app/components/popups/product_configurator_popup/product_configurator_popup`
- Cash control: opening/closing popups under `@point_of_sale/app/components/popups/`
- Asset bundle: `point_of_sale._assets_pos` · Models loaded via `_load_pos_data_fields` + `_load_pos_data_read`
- OWL: `patch(Class.prototype, {...})`, `useEffect(effect, () => [deps])`, `super.method(...arguments)`

## POS UI Vocabulary (shared glossary)
Use these official Odoo component names so we don't get confused.

**Screens** (full "pages", registered in `pos_pages`):
| Name | Meaning |
|------|---------|
| `ProductScreen` | Main order-taking screen (product grid + cart). Cashiers live here. |
| `PaymentScreen` | Taking payment for the current order. |
| `ReceiptScreen` | Receipt shown after payment. |
| `TicketScreen` | The **Orders** screen — search/browse past & open orders. |
| `LoginScreen` | Lock / cashier-login screen (lock→unlock passes through here). |
| `SaverScreen` | Idle screensaver. |

**Navbar** = the whole top strip (`point_of_sale.Navbar`, file `navbar_patch.xml`). Holds: `Register`
button, `orders-button` (Orders), the ＋ new-order, `OrderTabs` (the `73001…` tabs), product-search
`Input`, barcode button, `CashierName` (avatar), the lock, and the ☰ hamburger (`Dropdown` — Cash
In/Out, Close Register…). *Our additions:* the **hub buttons** (New Order / Settle / Orders).

**Product screen parts:** `products`/product grid (cards) · **category buttons** (the colored pills =
product categories) · `OrderSummary` = the **cart**, made of `Orderline`s · **control buttons**
(bottom-left: Customer, Note…) · `Numpad` + `Actionpad` (number pad + **Pay**) · *our* **setup banner**
(the green/red "complete New Order details" strip — NOT the navbar).

**Orders screen (TicketScreen) parts:** `SearchBar` = the "Search Orders" bar · *our* **customer search
bar** above it · the **order list** (rows) · the **detail/refund pane** on the right.

**Popups / Modals** (float over a screen): `PartnerList` = the "Choose customer" picker · **Product
Configurator** · **Opening/Closing control** (cash-count popups) · *our* **New Order modal**,
**Action hub**, **Settle modal**.

Rules of thumb: **"screen"** = a full page · **"navbar"** = top strip (vs the lower **"setup banner"**) ·
**"popup"/"modal"** = floats on top.
