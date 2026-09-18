# Putting this live at reply.sortxai.com

Your main site stays on Netlify and is never touched. The Reply Ladder is a
separate deployment on Vercel, and one DNS record points the subdomain at it.

## Why not Netlify, and why not sortxai.com/reply

Netlify serves static files. This app needs a server, because creating a
Razorpay order and verifying a payment signature both use your key secret, and
a key secret in a browser is not a secret.

A path like `sortxai.com/reply` would mean proxying part of your Netlify site
to a server elsewhere. That works, but it puts a rewrite rule between every
buyer and their checkout, and when it breaks it breaks silently. A subdomain is
one DNS record, nothing in front of it, and nothing that can take your main
site down with it.

## Part 1. Deploy to Vercel, about 10 minutes

1. Push this folder to a GitHub repo. `.gitignore` already excludes `.env`,
   `node_modules`, `sales.log` and `outbox`, so nothing secret goes up. Check
   that before you push:

   ```bash
   git status
   ```

   If `.env` shows up in that list, stop and fix `.gitignore` first.

2. Go to vercel.com, sign in with GitHub, New Project, pick the repo.

3. Leave the build settings alone. `vercel.json` already tells Vercel to serve
   `public/` and turn `api/*.js` into functions.

4. Before deploying, open Environment Variables and add:

   | Name | Value |
   |---|---|
   | `RAZORPAY_KEY_ID` | `rzp_test_TdEWMvuHwjMMNk` |
   | `RAZORPAY_KEY_SECRET` | your test secret |
   | `PRODUCT_AMOUNT_PAISE` | `99900` |
   | `PRODUCT_CURRENCY` | `INR` |

   Add `RAZORPAY_WEBHOOK_SECRET` later, in Part 3.

5. Deploy. You get a URL like `reply-ladder.vercel.app`. Open it and click the
   buy button. If the Razorpay modal opens, the functions are working.

## Part 2. Point reply.sortxai.com at it, about 5 minutes plus DNS wait

In Vercel: Project, Settings, Domains, Add, type `reply.sortxai.com`. Vercel
shows you a CNAME record to create.

Now add that record wherever your DNS lives. Two cases:

**If sortxai.com uses Netlify DNS** (you set nameservers to Netlify when you
added the domain): Netlify dashboard, Domains, sortxai.com, DNS records, Add
new record.

- Type: `CNAME`
- Name: `reply`
- Value: whatever Vercel showed you, usually `cname.vercel-dns.com`

**If DNS is still at your registrar** (GoDaddy, Namecheap, Hostinger): add the
same CNAME in the registrar's DNS panel instead.

Either way, only add the `reply` record. Do not touch the existing records for
`sortxai.com` or `www`, or you will take the main site down.

DNS usually resolves in a few minutes and can take a couple of hours. Vercel
issues the HTTPS certificate automatically once it sees the record.

## Part 3. The webhook

Do this after the domain works.

1. Razorpay dashboard, Settings, Webhooks, Add New Webhook.
2. URL: `https://reply.sortxai.com/api/razorpay-webhook`
3. Active event: `payment.captured` only.
4. Set a secret, something long and random.
5. Put the same value in Vercel as `RAZORPAY_WEBHOOK_SECRET`, then redeploy.

Vercel only picks up new environment variables on a fresh deploy. Changing a
variable without redeploying does nothing, which is a confusing hour if you do
not know it.

## Part 4. Going live with real money

1. Finish KYC in Razorpay.
2. Generate live keys. Switch the Vercel variables to the `rzp_live_` pair and
   redeploy. Live keys never go in the repo.
3. Change the webhook to your live-mode webhook as well. Test and live mode
   have separate webhook lists, and forgetting this is the usual reason live
   sales stop appearing in your logs.
4. Buy your own product for one rupee. Set `PRODUCT_AMOUNT_PAISE` to `100`,
   redeploy, buy it, confirm the WhatsApp button appears with your payment
   reference, then set it back to `99900` and redeploy again.
5. Refund that rupee from the dashboard.

## Seeing your sales

On Vercel, sales are in the function logs rather than a file, because
serverless functions do not keep a filesystem between requests.

Vercel dashboard, your project, Logs, then search for `NEW SALE`. Each line has
the payment id, order id, buyer email and phone. Razorpay's own Payments page
has the same information and is the record that actually matters.

The local `sales.log` file still works when you run `npm start` on your Mac.

## Sending the pack

Unchanged. Run this on your own machine, not on the server:

```bash
npm run pack -- --name "Rahul Verma" --phone "+91 98765 43210" --order order_XXXX
```

The copy lands in `outbox/`. Attach it in WhatsApp.

## If something goes wrong

**Buy button does nothing.** Open the browser console. If `create-order`
returns 500, your environment variables are missing or you did not redeploy
after adding them.

**401 from create-order.** Key id and secret are mismatched, or one is from
test mode and the other from live.

**Domain shows Vercel's 404.** DNS has propagated but the domain is not
attached to the project. Re-check Settings, Domains.

**Domain still shows nothing after a few hours.** The CNAME is wrong or went
on the wrong zone. Check with:

```bash
dig reply.sortxai.com CNAME +short
```

## If you later want sortxai.com/reply as well

Keep this deployment as it is, and add a proxy on the Netlify side. In a
`_redirects` file at the root of your Netlify site:

```
/reply/*  https://reply.sortxai.com/:splat  200
```

Both URLs then work, with the subdomain doing the actual serving. The page and
the server already handle being mounted under a path, so nothing else changes.
