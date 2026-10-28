# THE GRAND LINE · Admin

One website with: Dashboard, Billing, Stock, Polaroid Maker, UPS PDF Maker, Image Enhancer, Settings.
Works on phone too (menu moves to the bottom). On a computer, the ◀ button at the bottom of the menu hides it for more room.

## Run
1. Install Node.js (LTS) from https://nodejs.org if you do not have it.
2. Windows: double-click `start.bat`. Mac/Linux: run `./start.sh`.
   (Or: `npm install` once, then `npm start`.)
3. Open http://localhost:3000

Other people on the same Wi-Fi can open `http://<your-PC-IP>:3000`.
To protect it with a password, copy `.env.example` to `.env` and set `ADMIN_PASSWORD` (username: `admin`).

## First thing to do: Settings
- Selling prices are pre-filled: A4 60, A5 30, A6 20, Polaroid 10.
- Materials are pre-filled with Matte and Glossy. Rename, delete or add yours.
- Type the **original (cost) price** for every size + material. Until then the dashboard
  shows a warning because profit would be wrong.
- Need A3? Add it under "Sizes and selling price".

## Billing
- Pick the material, then tap **+** / **+5** / **+10** on a size (or type the number). Or use quick entry: `A4 20, A5 10, Polaroid 5`.
- Price on each line can be changed for that bill only. Bill-level discount: percent or amount.
- Edit or Delete any bill from the "All bills" list. Edited bills keep the cost they were sold at.
- Discounts are shared across the lines of a bill, so profit per size / material stays correct.

## Stock
Google Drive cannot be read without a Google login, so stock is kept here:
paste file names (one per line) or add one by one, then mark items **Sold**.
Use the Available / Sold tabs to see only what is left. "Open Drive folder" opens your folder.

## Data
- Everything is saved in `data/grandline.db` (SQLite). Back it up from Settings, or just copy the file.
- Table definitions are plain SQL in `schema.sql`.
- Settings → "Export all bills" gives a CSV for Excel.

## Image Enhancer
Opens waifu2x on DeepAI. DeepAI may refuse to show inside another page, so the main button opens it in a new tab.

## Colours
All colours are at the top of `public/css/app.css` (`:root`). Change them there.

## Tools
- `public/tools/polaroid` = your Polaroid Studio, `public/tools/pdf` = your Sheet Maker. Files are unchanged.
  They stay loaded while you move between pages, so you do not lose your work.
