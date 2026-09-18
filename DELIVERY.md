# How the PDF reaches the buyer

Delivery is manual. The buyer pays, then messages you on WhatsApp with their
email and proof of payment, and you send their watermarked copy by hand.

## What the buyer sees

This is stated on the page **before** they pay, in the offer box, so nobody is
surprised at checkout:

1. Pay. UPI, card or net banking, through Razorpay.
2. WhatsApp +91 96327 12005 with your email address and a screenshot of the payment.
3. Your copy arrives within 24 hours, watermarked with your name.

After a successful payment the page shows a green WhatsApp button that opens a
chat with you, pre-filled with their payment reference and a blank line for
their email. They just add the email and hit send.

## What you do

When a payment goes through, the server prints this in your terminal and
appends the same row to `sales.log`:

```
  NEW SALE. Send the pack by hand.
  payment  pay_XXXXXXXXXXXX
  order    order_XXXXXXXXXXXX
  email    buyer@example.com
  phone    +919876543210
  make it: npm run pack -- --name "Their Name" --phone "+919876543210" --order order_XXXX
```

Razorpay captures their email and phone at checkout, so you have those even if
they never message you. That matters: it means a buyer who pays and goes quiet
can still be chased rather than silently lost.

Build their copy:

```bash
npm run pack -- --name "Rahul Verma" --phone "+91 98765 43210" --order order_XXXX
```

It lands in `outbox/The-Reply-Ladder-rahul-verma.pdf`, watermarked on every
page with `Licensed to Rahul Verma · +91 98765 43210` bottom left and the order
reference bottom right. Attach it in WhatsApp and you are done. Takes about a
minute per buyer.

Only `--name` is required. Include `--order` anyway, because that is what lets
you trace a leaked copy back to who leaked it.

## Keeping track

`sales.log` is one JSON line per sale with `"sent": false`. Mark it `true` by
hand once you have sent it, or just keep a column in your tracker. At launch
volume a text file is enough. Do not build a database for this yet.

## When this stops working

Manual delivery is fine to about 30 sales a month. Past that it becomes an
hour a day and buyers start waiting. The automatic version is already written
and sitting in `lib/deliver.js`: `sendPack()` watermarks and emails in one go.
To switch it on, add SMTP credentials to `.env` and call `sendPack()` from the
verified branch in `server.js` instead of `recordSale()`.

## The webhook

Still worth setting up once you deploy. If a buyer pays and closes the tab
before the browser finishes, the sale would never reach your terminal and you
would not know to chase them.

1. Razorpay dashboard, Settings, Webhooks, Add New Webhook.
2. URL: `https://yourdomain.com/api/razorpay-webhook`
3. Active event: `payment.captured`
4. Set a secret, put the same value in `RAZORPAY_WEBHOOK_SECRET` in `.env`.

Sales are de-duplicated by payment id, so you never get the same one twice.

## The honest tradeoff

Manual delivery costs you conversions. Some people will pay and never send the
message, especially late at night, and then feel they have been had until you
reach them. Two habits cover it:

- Check your terminal or `sales.log` at least twice a day during launch.
- If someone paid more than a few hours ago and has not messaged, message
  them first using the phone number Razorpay captured. Getting there before
  they worry turns a near-complaint into a good impression.
