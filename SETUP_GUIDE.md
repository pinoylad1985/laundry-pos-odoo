# Laundry POS — Setup Guide

---

## Part 1: GitHub Setup (one-time, ~10 minutes)

### Step 1 — Create a GitHub account (skip if you already have one)
1. Open your browser and go to **github.com**
2. Click **Sign up** and follow the steps
3. Verify your email address

---

### Step 2 — Create a new repository
1. Once logged in to GitHub, click the **+** icon in the top-right corner
2. Click **New repository**
3. Fill in the form:
   - **Repository name:** `laundry-pos-odoo`
   - **Description:** `Custom Odoo POS module for laundry services` (optional)
   - **Visibility:** Private *(recommended — keeps your business code private)*
   - Leave everything else as-is
4. Click **Create repository**
5. GitHub will show you a page with setup instructions — keep this tab open

---

### Step 3 — Install GitHub Desktop (easier than command line)
1. Go to **desktop.github.com**
2. Click **Download for Windows**
3. Install it and sign in with your GitHub account

---

### Step 4 — Upload the module folder to GitHub
1. Open **GitHub Desktop**
2. Click **File → Add local repository**
3. Click **Choose…** and navigate to:
   ```
   C:\Users\pinoy\laundry-pos-odoo
   ```
4. If it says "not a git repository", click **create a repository here**
5. In the bottom-left, type a summary like `Initial commit` and click **Commit to main**
6. Click **Publish repository** (top of the window)
7. Make sure **Keep this code private** is checked, then click **Publish Repository**

Your code is now on GitHub. ✓

---

## Part 2: Connect GitHub to Cloudpepper (~5 minutes)

> **Note:** Cloudpepper's dashboard may look slightly different depending on your plan.
> Look for menu items that say **Git**, **GitHub**, **Custom Modules**, or **Addons**.

### Step 1 — Find the GitHub/Addons integration
1. Log in to your **Cloudpepper dashboard**
2. Look for a section called **Git Repositories**, **Custom Addons**, or similar
3. Click **Connect GitHub** or **Add Repository**

### Step 2 — Authorize and select the repo
1. Click **Authorize with GitHub** if prompted
2. Select the **laundry-pos-odoo** repository you just created
3. When asked for the **addons path** or **module path**, type:
   ```
   laundry_pos
   ```
   *(this points Cloudpepper to the folder inside the repo that is the actual Odoo module)*

### Step 3 — Deploy
1. Click **Save** or **Deploy**
2. Cloudpepper will pull the code and restart Odoo
3. This usually takes 1–3 minutes

---

## Part 3: Install the Module in Odoo (~2 minutes)

1. Open your Odoo instance
2. Go to **Settings** (top menu)
3. Enable **Developer Mode**: scroll to the bottom of Settings → click **Activate developer mode**
4. Go to **Apps** (top menu)
5. Click **Update App List** (top-left button)
6. Search for **Laundry POS**
7. Click **Install**

---

## Part 4: Tag Your Products (~5 minutes per product)

After installing, you need to tell Odoo which products belong to which service types.

1. Go to **Point of Sale → Products → Products**
2. Open a product (e.g., Wash-Dry-Fold)
3. Click the **Laundry Services** tab
4. In the **Available for Service Types** field, select which service types apply
   - Example: Wash-Dry-Fold → select *Drop-off*, *Drop-off & Delivery*, *Pickup & Delivery*
   - Leave **blank** = product shows for ALL service types
5. Click **Save**

Repeat for each product.

---

## Part 5: Pushing Future Updates

Whenever we make changes to the module:

1. GitHub Desktop will show the changed files
2. Type a summary of what changed in the bottom-left box
3. Click **Commit to main**
4. Click **Push origin** (top of the window)
5. Go to Cloudpepper → click **Pull** or **Deploy** to apply the update

---

## How the POS Modal Works

When a cashier starts a **New Order**, a modal appears automatically:

1. **Who is this order for?**
   - *New Customer* → opens the customer creation form after you click Continue
   - *Returning Customer* → opens the customer search after you click Continue

2. **Select Service Type**
   - Drop-off / Drop-off & Delivery / Pickup & Delivery / Locker / Self-service

3. Click **Continue** — the POS screen opens and only shows products
   tagged for the selected service type.

4. Click **Skip for now** — the order opens normally with no filtering.
