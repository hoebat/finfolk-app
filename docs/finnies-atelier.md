# Finfolk Coop in the Atelier

Open `http://127.0.0.1:8770/#preview/finnies-shop` with `npm run moodboard` running. The **Finfolk Coop** screen category contains the catalogue, confirmation, reward history, empty catalogue and management screens. The shared **More → Finfolk Coop** link opens it from other local product studies. **Workflow reviews → Spend Finnies at Finfolk Coop** covers the complete journey.

The study starts with 120 sample Finnies and fictional outlet offers. Choose a reward, confirm the price, then find its code in **Your rewards**. Purchases update the sample balance and stock; claims survive refresh. **Manage shop** can publish a sample reward or mark a claim fulfilled/refunded. Refunds return the original cost and restore stock once. Preview controls include a low-balance account, guest, empty catalogue and a reset for the sample data. All changes are local to the browser, under `finfolk:atelier:finnies:v1` (the low-balance scenario uses a separate suffix).

This follows the application shop implemented in `finfolk-next` at `/shop` and `/shop/manage`. The Atelier uses local sample data and never spends a real member's Finnies or calls the production shop API. Actual Neon transactions, authentication and concurrency remain tested in that application's database suite.

The shop uses the shared Atelier navigation, visual palettes, theme messages and workflow review system. Run `npm run test:finnies-atelier` for the interactive spending, history, refund, publication, guest privacy, theme and responsive checks. Existing Atelier route, scrolling, moodboard, screen and workflow suites cover the registration and surrounding interface.

Finnies have a small coin symbol: a round, spiky pufferfish face with round goggles and crooked teeth. The vector asset is `design-board/finnie-symbol.svg`; balances and catalogue prices use it as a colour-inheriting mask. The adjacent Finnies label remains visible, and the decorative symbol is hidden from screen readers. A standalone preview is in `docs/previews/finnie-symbol.png`.
