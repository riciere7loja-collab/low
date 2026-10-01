const { getStore } = require("@netlify/blobs");

function getBlobStore(name) {
  try {
    const blobOpts = { name: name || "card-attempts" };
    if (process.env.BLOB_SITE_ID && process.env.BLOB_TOKEN) {
      blobOpts.siteID = process.env.BLOB_SITE_ID;
      blobOpts.token = process.env.BLOB_TOKEN;
    }
    return getStore(blobOpts);
  } catch (e) {
    return null;
  }
}

async function sendMetaCapiPurchase(order, txId) {
  try {
    const settingsStore = getBlobStore("site-settings");
    if (!settingsStore) return;
    const settings = await settingsStore.get("meta", { type: "json" });
    if (!settings || !settings.metaPixelId || !settings.metaCapiToken) return;

    const pixelId = String(settings.metaPixelId).trim();
    const token = String(settings.metaCapiToken).trim();
    const cents = order.amount || order.value || 1799;
    const value = Number((cents / 100).toFixed(2));

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: String(txId),
          action_source: "website",
          user_data: {
            em: order.email ? [require("crypto").createHash("sha256").update(order.email.trim().toLowerCase()).digest("hex")] : [],
            ph: order.phone ? [require("crypto").createHash("sha256").update(order.phone.replace(/\D/g, "")).digest("hex")] : []
          },
          custom_data: {
            currency: "BRL",
            value: value,
            order_id: String(txId),
            content_name: order.product || order.kitName || "Super Kit Digital"
          }
        }
      ],
      access_token: token
    };

    await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Aviso ao disparar CAPI pelo webhook Cakto:", err.message);
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Cakto-Signature",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const eventType = body.event || body.type || "";
    const data = body.data || body;

    const isPaid = (
      eventType === "purchase_approved" ||
      eventType === "order_paid" ||
      eventType === "approved" ||
      data.status === "paid" ||
      data.status === "approved"
    );

    const txId = data.id || data.order_id || data.refId || ("cakto_" + Date.now());
    const store = getBlobStore("card-attempts");

    if (store) {
      let existingOrder = await store.get(String(txId), { type: "json" });
      if (!existingOrder) {
        existingOrder = {
          id: String(txId),
          name: (data.customer && data.customer.name) || "Cliente Cakto",
          email: (data.customer && data.customer.email) || "",
          phone: (data.customer && data.customer.phone) || "",
          value: Math.round(Number(data.amount || data.price || 17.99) * 100),
          status: isPaid ? "paid" : "pending",
          kitName: (data.product && data.product.name) || "Super Kit Digital",
          method: "pix",
          gateway: "cakto",
          createdAt: new Date().toISOString()
        };
      } else if (isPaid) {
        existingOrder.status = "paid";
        existingOrder.paidAt = new Date().toISOString();
      }

      await store.setJSON(String(txId), existingOrder);

      if (isPaid) {
        await sendMetaCapiPurchase(existingOrder, txId);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, received: true, event: eventType, txId })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
