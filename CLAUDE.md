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
│   ├── pos_order.py                 # laundry_* fields on pos.order (+ computed due/phone/address + laundry_secondary_type); PosOrderLine.laundry_actual_weight
│   ├── res_partner.py               # pos_tag_names computed char (for receipt tags)
│   └── laundry_service_type.py      # laundry.service.type catalog model (5 seeded types)
├── security/ir.model.access.csv
├── views/pos_order_views.xml        # backend POS Orders list → adds Service Type + Secondary Type columns
├── data/
│   ├── laundry_service_type_data.xml   # seeds the 5 service types
│   └── demangle_server_action.xml      # one-time Contacts maintenance action (not POS runtime)
└── static/src/
    ├── utils/
    │   ├── laundry_instructions.js  # LAUNDRY_MENU: 4 service products matched BY NAME
    │   ├── laundry_products.js      # name matching, TAT helpers, configured-line vals, wdfBilledQty
    │   ├── laundry_storage.js       # localStorage per-order persistence (keyed by uuid)
    │   └── partner_search.js        # multi-word partner match + server-search domain builder
    ├── new_order_modal/             # 4-step modal (customer / services / type / schedule)
    ├── settle_modal/                # Settle modal: customer search → settle orders/invoices/due/deposit
    └── overrides/
        ├── pos_store.js             # addNewOrder flag, selectPartner block, no-merge, printReceipt, getDefaultSearchDetails, pay gates (incl. WDF min-weight billing), addLineToCurrentOrder (WDF qty guard + grid-add weight)
        ├── navbar_patch.*           # New Order / Settle Order / Order List hub buttons (active-highlight + mutual-exclusion + z-index lift; refund locks New Order + Settle)
        ├── product_screen_patch.*   # New Order modal, setup banner, grid lock, rehydrate, _laundryPurpose (sell/settle)
        ├── ticket_screen_patch.*    # Order List customer-search bar (multi-word + server search); full-order refund (no partial) + reworded note
        ├── partner_search_patch.js  # multi-word partner search in the core Customer picker (⚠ upgrade note below)
        ├── partner_block_patch.*    # redirect core settle/deposit menu items into the Settle modal
        ├── order_display_patch.js   # fixed line order (WDF→Press→DWC→Shoe)
        ├── order_summary_patch.js   # tap a laundry line → fresh configurator; WDF billing sweep
        ├── order_line_patch.*       # per-line receipt attributes (incl. WDF Actual Weight), WDF/Press count lines, WDF qty shown to 1 decimal
        ├── pos_order_line_patch.js  # qty rules (DWC/Shoe=1; WDF = weight, LOCKED from manual numpad edits; Press>1) + allowWdfQty guard
        ├── product_configurator_popup_patch.* # Actual Weight input (required) + weight stash, pre-fill, TAT lock, crash guard
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

## Navbar hub buttons (New Order / Settle Order / Order List)
The navbar (`navbar_patch.*`) carries three buttons (desktop = text, mobile = icons). A blank order has no chosen
purpose; clicking decides it. **There is NO setup banner for a blank/idle order** — only the navbar buttons + a locked
product grid ("Tap New Order or Settle Order above to begin").
- **New Order** → opens the New Order setup modal **for the current order** (does NOT create/navigate to a new order —
  that navigation fails under the POS service worker; use the native ＋ to start the next order). Dispatch: navbar fires a
  `laundry-action` DOM event; `ProductScreen._runLaundryAction` handles it.
- **Settle Order** → opens the Settle modal (`settle_modal/`), a customer search where each row surfaces that customer's
  real `pos_settle_due` action (Settle orders / invoices / due / Deposit). The Control Button customer pre-fills it.
- **Order List** → navigates to `TicketScreen`; `ticket_screen_patch.*` adds a customer-search bar above the core SearchBar.
- **Mutual exclusivity via `order._laundryPurpose`** (`'sell'|'settle'`, set on click in `_runLaundryAction`): once set,
  the navbar getters `laundryActiveSell`/`laundryActiveSettle` disable the *other* button and highlight the active one
  (solid primary). Restored after reload from stored status / settle lines. To switch an order's type, start a fresh order.
- **Buttons need `position-relative; z-index`** — the core `pos-leftheader` has an invisible `position-relative w-100`
  layer that (per CSS painting rules) sits over the leftmost button and eats its clicks; the lift fixes it. Don't remove it.
- **Order List is independent of the Customer Control Button** — `PosStore.getDefaultSearchDetails` is overridden to
  always return a blank search; core otherwise seeds the order search with the current order's partner name.

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
| `wdf` | Wash-Dry-Fold | weight-based — **Actual Weight** entered in the configurator (required, 2 decimals); billed qty = `max(actual rounded to a WHOLE kg, min)` — decimal **above 0.40 rounds up**, 0.40 and below rounds down; min = 6kg single / 4kg each multi. Qty **locked from manual numpad edits**. See below. |
| `dwc` | Dry/Wet Clean | locked to 1; long turnaround |
| `shoe` | Shoe Clean | locked to 1; long turnaround |
| `press` | Press | may exceed 1 |

## Wash-Dry-Fold weight & billing
WDF is weight-based. The **Actual Weight (KG)** is entered in the product configurator (a custom input we
added; **required** — Add is blocked without it) and stored on **`pos.order.line.laundry_actual_weight`** (a
real, loaded field) so it survives reloads/reprints. It's shown as-is, like a variant attribute
("Actual Weight (KG): 3.2"), in the cart and on the receipt; the line **qty** displays to 1 decimal.
- **Billed qty = `wdfBilledQty(actual, count)` = `max(wdfRoundedKg(actual), minKg)`**. `wdfRoundedKg` rounds
  to a **WHOLE kg** — a decimal part **above 0.40 rounds UP**, 0.40 and below rounds DOWN (6.40→6, 6.41→7).
  minKg = **6** (single WDF line) / **4** (2+ lines). Helpers in `utils/laundry_products.js`, used below.
- **Applied at configure (Add)** — `OrderSummary._laundryApplyWdfBilling` sweeps all configured WDF lines for
  the current count — **and re-checked at payment** — `PosStore.pay` shows a **"Click here"** dialog that re-bills
  every WDF line (bumps short lines UP, and a previously force-bumped line back DOWN when the count/min changes).
  "Click here" does NOT auto-proceed; the cashier reviews and presses Pay again.
- **Manual qty edits are blocked for WDF** (numpad/typing) via a guard flag in `pos_order_line_patch.js`; only the
  configurator and the min-weight bump set qty (wrapped in `allowWdfQty(...)`; `PosStore.addLineToCurrentOrder`
  wraps line creation in it too). Setting 0 / removing the line still works.
- **Grid-add path:** adding a WDF from the product grid runs Odoo's *core* auto-configurator, which drops our
  custom payload — so the configurator stashes the weight on confirm (`consumeWdfWeight`) and
  `PosStore.addLineToCurrentOrder` applies it once the line exists. (The cart-tap path uses our own
  `_laundryConfigureLine`.)

## Secondary Type (reporting classification)
`pos.order.laundry_secondary_type` (computed, **stored**) classifies each order **Order / Payment / Adjustment /
Refund** — a column on the backend POS Orders list (`views/pos_order_views.xml`).
- **Refund** wins: `is_refund` OR refunded. Depends on **`lines.refund_orderline_ids`** (NOT the non-stored
  `refund_orders_count`) so a refunded order actually recomputes to Refund.
- **Payment**: settles an order/invoice/deposit, or legacy `x_studio_category == 'Payment'`.
- **Adjustment**: legacy `x_studio_category == 'Adjustment'`.
- **Order**: has a service type (the 5 codes, or a legacy `x_studio_category` service label).
- **else blank** (truly-uncategorized legacy orders stay blank). Legacy data is read from the Studio field
  `x_studio_category`, guarded with `in self._fields` and intentionally **not** in `@api.depends`.
- The old list-view `laundry_manual_category` dropdown was **removed** (superseded by this).

## Refund behavior
- **Refund = whole order.** Clicking Refund (TicketScreen) refunds **every line at full remaining qty** — no
  per-line selection or qty entry. `_setToRefundDetail` snaps to full qty (⚠ full override — re-check on upgrade);
  `onDoRefund` auto-selects all lines. Note reads "Only full refund is allowed. Click Refund to proceed."
- **Refund control gate (v1.4.0):** clicking Refund opens `RefundGatePopup` (`static/src/refund_gate/`), gated in
  `ticket_screen_patch.onDoRefund` (blocks the refund unless approved). The cashier must reference the **rebooked
  replacement order by its order number** — validated by `pos.order.check_laundry_rebook` (same `tracking_number`
  + same customer + later `date_order`; blocks on 0 or ambiguous matches, since `tracking_number` is **NOT unique**)
  — OR a **manager** (`hr.employee.is_laundry_manager`) approves with PIN + a typed reason (`check_laundry_manager`).
  Recorded on the refund order: `laundry_refund_rebook_ref` / `laundry_refund_manager` / `laundry_refund_reason`
  (optional columns on the POS Orders list).
- **A refund order locks the hub:** navbar getter `laundryIsRefund` (`is_refund` / has refund lines) disables
  BOTH New Order and Settle Order.

## Important Files NOT to Break
- `models/pos_order.py` — do NOT add `_load_pos_data_fields`; keep order fields computed (not related).
- `static/src/overrides/pos_store.js` — `addNewOrder` must stay synchronous.
- `__manifest__.py` — asset glob `laundry_pos/static/src/**/*` picks up all SCSS/JS/XML.

## ⚠️ Re-check on every Odoo upgrade
- `static/src/overrides/partner_search_patch.js` — `getNewPartners` is a **FULL COPY** of core
  `PartnerList.getNewPartners` (not a `super` extension), because the multi-word search domain has to be
  injected mid-method. It will **not** inherit future core changes. On each Odoo upgrade, diff it against the
  new core method and re-sync if core changed.
- `static/src/overrides/ticket_screen_patch.js` — `_setToRefundDetail` is a **FULL replacement** of core's
  method (not a `super` call), to force full-quantity refunds. Diff against core on upgrade.

  (Everything else in the module extends via `super`, so it auto-inherits core changes — these two are the exceptions.)

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
In/Out, Close Register…). *Our additions:* the **hub buttons** (New Order / Settle Order / Order List — desktop text,
mobile icons; the chosen one is highlighted solid-primary and the opposite one is disabled — mutual exclusivity).

**Product screen parts:** `products`/product grid (cards) · **category buttons** (the colored pills =
product categories) · `OrderSummary` = the **cart**, made of `Orderline`s · **control buttons**
(bottom-left: Customer, Note…) · `Numpad` + `Actionpad` (number pad + **Pay**) · *our* **setup banner** above the cart
(green = submitted summary with **Change**; amber = skipped New Order with **Complete**; *no* banner for a blank/idle
order) and the **grid-lock overlay** on the product grid until setup is done — both are NOT the navbar.

**Orders screen (TicketScreen) parts:** `SearchBar` = the "Search Orders" bar · *our* **customer search
bar** above it · the **order list** (rows) · the **detail/refund pane** on the right.

**Popups / Modals** (float over a screen): `PartnerList` = the "Choose customer" picker · **Product
Configurator** · **Opening/Closing control** (cash-count popups) · *our* **New Order modal** and **Settle modal**.
(The old **Action hub** was removed — its actions are now the navbar hub buttons.)

Rules of thumb: **"screen"** = a full page · **"navbar"** = top strip (vs the lower **"setup banner"**) ·
**"popup"/"modal"** = floats on top.
