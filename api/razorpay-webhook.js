/**
 * POST /api/razorpay-webhook   (Vercel serverless)
 *
 * Backstop. If a buyer pays and closes the tab before the browser calls
 * verify-payment, the sale would never be logged and you would not know to
 * send them anything. Razorpay fires this regardless.
 *
 * Signature is HMAC_SHA256 over the RAW body, so body parsing is turned off
 * and the stream is read by hand. Re-serialising parsed JSON will not match.
 */

const { verifyWebhook, fetchPayment } = require("../lib/razorpay");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (error) {
    console.error("Could not read webhook body:", error && (error.message || error));
    return res.status(400).json({ ok: false });
  }

  if (!verifyWebhook(raw, req.headers["x-razorpay-signature"])) {
    console.warn("Webhook signature invalid, ignoring");
    return res.status(400).json({ ok: false });
  }

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ ok: false });
  }

  if (event.event !== "payment.captured") {
    return res.status(200).json({ ok: true });
  }

  const payment =
    event.payload && event.payload.payment && event.payload.payment.entity;

  if (payment) {
    let buyer = {};
    try {
      buyer = await fetchPayment(payment.id);
    } catch (error) {
      console.error("Could not fetch payment details:", error && (error.message || error));
    }

    console.log(
      "NEW SALE (webhook) " +
        JSON.stringify({
          at: new Date().toISOString(),
          paymentId: payment.id,
          orderId: payment.order_id,
          email: buyer.email || payment.email || "",
          phone: buyer.phone || payment.contact || "",
          amount: payment.amount || "",
        })
    );
  }

  return res.status(200).json({ ok: true });
};

/* Tell Vercel not to parse the body. This must come AFTER the assignment to
   module.exports above, or it gets overwritten and the raw body is lost. */
module.exports.config = { api: { bodyParser: false } };
