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
    const cents = order.amount || 7580;
    const value = Number((cents / 100).toFixed(2));

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: txId,
          event_source_url: "https://yczpromoo.netlify.app",
          action_source: "website",
          user_data: {
            client_ip_address: order.ip || "",
            client_user_agent: (order.customer && order.customer.userAgent) || ""
          },
          custom_data: {
            currency: "BRL",
            value: value,
            order_id: txId,
            content_name: `Kit ${order.kit || 3}`
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
    console.warn("Aviso ao disparar CAPI pelo webhook:", err.message);
  }
}

async function registerLiveEvent(txId, label) {
  try {
    const store = getBlobStore("card-attempts");
    if (!store) return;
    const traffic = (await store.get("live_traffic", { type: "json" })) || { events: [] };
    traffic.events = traffic.events || [];
    traffic.events.unshift({
      name: "venda_paga",
      label: label || `Pedido ${txId.slice(0, 10)}`,
      city: "Brasil",
      t: Date.now()
    });
    if (traffic.events.length > 40) traffic.events = traffic.events.slice(0, 40);
    await store.setJSON("live_traffic", traffic);
  } catch (e) {}
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-client-id, x-client-secret",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const body = JSON.parse(event.body || "{}");
    const t = body.transaction || body.data || body;
    const txId = t.id || t.transactionId || t.misticPayId || t.ourId || t.elitePayId;

    if (!txId) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, note: "no transaction id received" }) };
    }

    const s = String(t.status || "").toLowerCase();
    const state = String(t.transactionState || "").toUpperCase();
    const isPaid = s === "pago" || s === "paga" || s === "aprovado" || s === "completo" || s === "concluido" || s === "concluida" || t.creditoProcessado === true || state === "COMPLETO";

    const store = getBlobStore("card-attempts");
    let matchedOrder = null;

    if (store) {
      const { blobs } = await store.list();
      for (const b of blobs) {
        if (b.key === "settings" || b.key === "meta" || b.key === "live_traffic") continue;
        const item = await store.get(b.key, { type: "json" });
        if (item && (item.id === txId || item.transactionId === txId || b.key === txId)) {
          if (isPaid) {
            item.status = "paid";
            item.paidAt = new Date().toISOString();
          } else if (s === "expirado" || s === "cancelado" || state === "CANCELADO") {
            item.status = "expired";
          }
          await store.setJSON(b.key, item);
          matchedOrder = item;
          break;
        }
      }

      // Se o pedido não estava nos blobs, cria registro para não perder a venda
      if (!matchedOrder && isPaid) {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        matchedOrder = {
          timestamp: new Date().toISOString(),
          id: txId,
          transactionId: txId,
          customer: { name: t.payerName || "Cliente Pix (ProPix)" },
          attribution: { source: "propix_webhook" },
          kit: 3,
          bump: false,
          method: "pix",
          amount: Math.round(Number(t.valorBruto || 75.8) * 100),
          status: "paid",
          paidAt: new Date().toISOString(),
          gateway: "ProPix"
        };
        await store.setJSON(id, matchedOrder);
      }
    }

    // Se a venda foi confirmada, notifica CAPI do Facebook e painel ao vivo
    if (isPaid) {
      await Promise.allSettled([
        sendMetaCapiPurchase(matchedOrder || { amount: Math.round(Number(t.valorBruto || 75.8) * 100) }, txId),
        registerLiveEvent(txId, matchedOrder && matchedOrder.customer ? matchedOrder.customer.name : "Venda aprovada")
      ]);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, status: isPaid ? "paid" : s, txId })
    };
  } catch (err) {
    console.error("Erro no webhook ProPix:", err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
