# The Reply Ladder

Sales page plus Razorpay Standard Checkout.

## Run it locally

```bash
npm install
npm start
```

Open http://localhost:3000 and click **Yes, I want in**.

Razorpay is in test mode, so use a test card at checkout. Card
`4111 1111 1111 1111`, any future expiry, any CVV, any OTP. No real money moves.
Test UPI id: `success@razorpay`.

## What happens when someone pays

1. Browser calls `POST /api/create-order`.
2. Server creates the order with Razorpay and returns `order_id`, `amount`,
   `currency` and the **public** key id.
3. Browser opens the Razorpay modal with that order id.
4. On success Razorpay hands back `razorpay_payment_id`, `razorpay_order_id`
   and `razorpay_signature`.
5. Browser posts all three to `POST /api/verify-payment`.
6. Server recomputes `HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)` and
   compares it in constant time. Only a match counts as paid.

The price lives on the server in `PRODUCT_AMOUNT_PAISE`. The browser never
sends an amount, so nobody can edit the price in devtools and pay one rupee.

## Files

```
server.js                 Express app: static site + both API routes
lib/razorpay.js           Order creation and signature verification
api/create-order.js       Same logic as a Vercel serverless function
api/verify-payment.js     Same logic as a Vercel serverless function
public/index.html         The sales page, with checkout wired up
public/priyansh.jpg       Founder photo
public/proof-1.jpg        Reply screenshot
public/proof-2.jpg        Reply screenshot
.env                      Your keys. Never commit this.
.env.example              Template for anyone else running the project.
lib/deliver.js            Watermarks the PDF. Also has the unused auto-email path.
scripts/pack.js           npm run pack, builds one buyer's copy into outbox/
sales.log                 One line per sale. Created on the first payment.
assets/                   The master PDF. Never modified at runtime.
build.py                  Regenerates public/index.html from the page source.
```

## Deploying

**Any Node host (Render, Railway, Fly, a VPS):** push the repo, set the
environment variables from `.env` in the host's dashboard, run `npm start`.

**Vercel:** `vercel deploy`. The `api/` folder becomes serverless functions and
`public/` is served as static. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
and `PRODUCT_AMOUNT_PAISE` in Project Settings, Environment Variables.

Netlify static hosting alone will not work, because order creation and
signature verification have to run somewhere your key secret is safe.

## Going live

1. Complete KYC in the Razorpay dashboard.
2. Generate live keys and swap `rzp_test_...` for `rzp_live_...` in your host's
   environment variables. Do not put live keys in the repo.
3. Test one real payment of one rupee, then refund it from the dashboard.
4. Add the webhook secret in your host's environment variables, same as the
   Razorpay keys. See DELIVERY.md.

## Delivery

Manual. The buyer pays, messages you on WhatsApp with their email and proof of
payment, and you send their watermarked copy with `npm run pack`. See
DELIVERY.md.
# reply-ladder
# reply-ladder
