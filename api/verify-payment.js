/**
 * POST /api/verify-payment   (Vercel serverless)
 *
 * Verifies HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET) against the
 * signature Razorpay returns. Returns 400 and records nothing when it does
 * not match.
 *
 * Delivery is manual, so a verified payment is logged with the buyer's email
 * and phone. Read it in Vercel: Project, Logs, filter on "NEW SALE".
 */

const { verifySignature, fetchPayment } = require("../lib/razorpay");

async function logSale({ paymentId, orderId }) {
  let buyer = {};
  try {
    buyer = await fetchPayment(paymentId);
  } catch (error) {
    console.error("Could not fetch payment details:", error && (error.message || error));
  }

  console.log(
    "NEW SALE " +
      JSON.stringify({
        at: new Date().toISOString(),
        paymentId,
        orderId,
        email: buyer.email || "",
        phone: buyer.phone || "",
        amount: buyer.amount || "",
      })
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      verified: false,
      error: "Missing order id, payment id or signature.",
    });
  }

  let ok;
  try {
    ok = verifySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
  } catch (error) {
    console.error("verify-payment failed:", error && (error.message || error));
    return res
      .status(500)
      .json({ verified: false, error: "Verification failed. Please contact support." });
  }

  if (!ok) {
    console.warn("Signature mismatch for order", razorpay_order_id);
    return res
      .status(400)
      .json({ verified: false, error: "Payment could not be verified." });
  }

  try {
    await logSale({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  } catch (error) {
    console.error("Could not log sale:", error && (error.message || error));
  }

  return res.status(200).json({
    verified: true,
    payment_id: razorpay_payment_id,
    order_id: razorpay_order_id,
  });
};
