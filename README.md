# Garden Court Inventory Admin

React + Vite + Supabase application for Garden Court Bar & Restaurant.

## Features
- Admin login using Supabase Auth. Database Row Level Security (RLS) protects all inventory tables.
- Brand Master: add/edit brands in Brandy, Whisky, Rum, Vodka, Gin, Beer, Breezer and Wine; deactivate brands.
- Price Master: separate editable rates for Full 750 ml, Half 375 ml and Quarter 180 ml.
- Daily stock: each brand appears once with three volume rows.
- Calculations: Total = O.B. + Rec.; Sales quantity = Total - C.B.; Rs. = Sales × Rate.
- Next date opening balance is prefilled from the most recent saved closing balance.
- Reports and browser printing.

**Important register assumption:** C.B. is treated as closing/remaining stock; Sales is Total minus C.B. This matches the usual stock-register meaning and your earlier clarification that C.B. is current balance. Confirm this before using live stock.

## Setup
1. Install Node.js 20+.
2. Create a Supabase project.
3. In Supabase SQL Editor, run the full `supabase/schema.sql`.
4. In Supabase Authentication > Users, create your admin login.
5. Copy the user's UUID and run:
   ```sql
   update public.profiles set role='admin', full_name='Garden Court Admin'
   where id='PASTE-USER-UUID';
   ```
6. Copy `.env.example` to `.env` and enter the Supabase Project URL and anon/publishable key:
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
   ```
7. In VS Code terminal:
   ```bash
   npm install
   npm run dev
   ```
8. Open the local URL shown by Vite.

## GitHub
```bash
git init
git add .
git commit -m "Garden Court inventory app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```
`.env` is ignored. Never commit the Supabase `service_role` key. Only use the anon/publishable key in the browser.

## Vercel
Import the GitHub repository. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables. Build command `npm run build`, output folder `dist`.

## Notes
- Save each category separately for the selected date; the app writes the visible category's brand lines for that date.
- The daily line stores the rate snapshot so future price changes do not alter old sales amounts.
- Opening balance is copied from the latest earlier saved entry. Verify the carried-forward amount before saving.
- Starter brands are examples; update them in Brand Master to match the physical register.
