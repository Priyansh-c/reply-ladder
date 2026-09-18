"""Builds public/index.html from the page source.

Swaps the inline base64 images for real files, drops the photo into the
about section, and wires the Razorpay checkout button.
"""

src = open('/home/claude/page_src.html').read()

# ---- 1. images as files rather than base64 -------------------------------
src = src.replace('data:image/jpeg;base64,IMG1_B64', 'proof-1.jpg')
src = src.replace('data:image/jpeg;base64,IMG2_B64', 'proof-2.jpg')

# ---- 2. real photo in the about block ------------------------------------
old_photo = '''    <div class="about-photo">
      [ YOUR PHOTO ]<br><br>
      Use a real founder photo here.<br>
      Not stock.
    </div>'''
new_photo = '''    <div class="about-photo">
      <img src="priyansh.jpg" alt="Priyansh, founder of SortXAi" width="520" height="520">
    </div>'''
assert old_photo in src, 'about-photo block not found'
src = src.replace(old_photo, new_photo)

# ---- 3. CSS additions ----------------------------------------------------
css_extra = '''
/* ---------- founder photo ---------- */
.about-photo{padding:0;border:1px solid var(--line);overflow:hidden;background:#0b0f15;}
.about-photo img{width:100%;height:100%;object-fit:cover;display:block;}

/* ---------- checkout button + status ---------- */
button.cta{font-family:inherit;cursor:pointer;}
button.cta[disabled]{opacity:.6;cursor:not-allowed;transform:none;}
.pay-status{margin-top:16px;min-height:20px;font-size:13px;line-height:1.6;}
.pay-status.error{color:#ff8f8f;}
.pay-status.ok{color:var(--lime);}
.pay-success{margin-top:20px;padding:22px;border:1px solid rgba(184,255,77,.35);border-radius:14px;background:rgba(184,255,77,.07);text-align:left;}
.pay-success h4{margin:0 0 8px;color:var(--white);font-size:17px;letter-spacing:-.02em;}
.pay-success p{margin:0;color:var(--muted);font-size:13px;line-height:1.7;}
.pay-success code{color:var(--lime);font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;}
.wa-cta{margin-top:18px;width:100%;background:#25D366;border-color:rgba(255,255,255,.22);box-shadow:0 0 0 1px rgba(37,211,102,.15),0 14px 35px rgba(37,211,102,.16);}
.wa-cta:hover{background:#31e675;box-shadow:0 0 0 1px rgba(37,211,102,.25),0 18px 45px rgba(37,211,102,.25);}
.wa-fallback{margin-top:12px !important;font-size:11.5px !important;color:var(--muted-2) !important;}
'''
src = src.replace('</style>', css_extra + '\n</style>', 1)

# ---- 4. swap the buy anchor for a real button ----------------------------
old_btn = '''        <a href="PASTE_RAZORPAY_LINK_HERE" class="cta offer-button">
          Yes, I want in
          <span class="cta-arrow">&rarr;</span>
        </a>

        <div class="offer-note">
          UPI &middot; Cards &middot; Net banking
        </div>'''
new_btn = '''        <button type="button" id="buy-button" class="cta offer-button">
          Yes, I want in
          <span class="cta-arrow">&rarr;</span>
        </button>

        <div class="offer-note">
          UPI &middot; Cards &middot; Net banking
        </div>

        <div id="pay-status" class="pay-status" role="status" aria-live="polite"></div>
        <div id="pay-success" class="pay-success" hidden>
          <h4>Payment received. One more step.</h4>
          <p>
            Message me on WhatsApp with your <b>email address</b> and a screenshot of this
            payment, and I will send your copy within 24 hours, watermarked with your name.
          </p>
          <p style="margin-top:10px;">
            Your payment reference is <code id="pay-ref"></code>. Screenshot this page if
            it is easier.
          </p>
          <a id="wa-link" class="cta wa-cta" href="#" target="_blank" rel="noopener">
            Message me on WhatsApp
            <span class="cta-arrow">&rarr;</span>
          </a>
          <p class="wa-fallback">
            Button not working? Message <b>+91 96327 12005</b> on WhatsApp, or email
            priyansh@sortxai.com with your payment reference.
          </p>
        </div>'''
assert old_btn in src, 'buy button block not found'
src = src.replace(old_btn, new_btn)

# ---- 5. checkout script --------------------------------------------------
checkout_js = r'''
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function () {
  var button  = document.getElementById("buy-button");
  var status  = document.getElementById("pay-status");
  var success = document.getElementById("pay-success");
  var payRef  = document.getElementById("pay-ref");
  var waLink  = document.getElementById("wa-link");

  if (!button) return;

  /* Works whether the page sits at /, /reply, /reply/ or /reply/index.html. */
  var apiBase = (function () {
    var p = window.location.pathname.replace(/\/[^\/]*\.[^\/]*$/, "/");
    if (p.charAt(p.length - 1) !== "/") p += "/";
    return p + "api/";
  })();

  function say(message, kind) {
    status.textContent = message || "";
    status.className = "pay-status" + (kind ? " " + kind : "");
  }

  function unlock() {
    button.disabled = false;
    button.style.opacity = "";
  }

  async function postJSON(url, body) {
    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  button.addEventListener("click", async function () {
    if (typeof window.Razorpay !== "function") {
      say("Could not load the payment window. Check your connection and try again.", "error");
      return;
    }

    button.disabled = true;
    say("Starting secure checkout...");

    var order;
    try {
      order = await postJSON(apiBase + "create-order");
    } catch (error) {
      unlock();
      say(error.message || "Could not start the payment. Please try again.", "error");
      return;
    }

    var checkout = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: "SortXAi",
      description: "The Reply Ladder",
      theme: { color: "#b8ff4d" },

      handler: async function (response) {
        say("Verifying your payment...");
        try {
          var result = await postJSON(apiBase + "verify-payment", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });

          if (result.verified) {
            say("");
            payRef.textContent = result.payment_id;

            var waText =
              "Hi Priyansh, I just bought The Reply Ladder.\n\n" +
              "Payment reference: " + result.payment_id + "\n" +
              "My email: \n\n" +
              "Screenshot of the payment attached.";

            waLink.href =
              "https://wa.me/919632712005?text=" + encodeURIComponent(waText);

            success.hidden = false;
            button.textContent = "Payment complete";
            success.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            unlock();
            say("We could not verify that payment. Message +91 96327 12005 on WhatsApp and I will sort it out.", "error");
          }
        } catch (error) {
          unlock();
          say("Payment went through but verification failed. Do not pay again. Message +91 96327 12005 on WhatsApp with your payment id.", "error");
        }
      },

      modal: {
        ondismiss: function () {
          unlock();
          say("Checkout closed. Nothing was charged.");
        }
      }
    });

    checkout.on("payment.failed", function (response) {
      unlock();
      var reason = (response && response.error && response.error.description) || "The payment did not go through.";
      say(reason + " Nothing was charged. You can try again.", "error");
    });

    checkout.open();
  });
})();
</script>
'''
src = src.rstrip() + "\n" + checkout_js

# ---- 6. full document ----------------------------------------------------
head_end = src.index('<style>')
head_bits = src[:head_end].strip()
rest = src[head_end:]

doc = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#07090d">
<meta name="description" content="The Reply Ladder: the cold outreach system that takes a stranger from first message, to reply, to qualified conversation, to booked call. 35 scripts across SMS, DM and email, plus what to say on the call.">
<meta property="og:title" content="The Reply Ladder">
<meta property="og:description" content="Stop sending random cold messages. The outreach system that ends in booked calls.">
<meta property="og:type" content="website">
<meta property="og:url" content="PASTE_YOUR_DOMAIN_HERE">
<meta property="og:image" content="PASTE_1200x630_SHARE_IMAGE_URL">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>&#129355;</text></svg>">
""" + head_bits + """
</head>
<body>
""" + rest + """
</body>
</html>
"""

open('/home/claude/reply-ladder/public/index.html', 'w').write(doc)
print("public/index.html written:", len(doc), "bytes")
