const { getStore } = require("@netlify/blobs");

function getBlobStore() {
  try {
    const blobOpts = { name: "card-attempts" };
    if (process.env.BLOB_SITE_ID && process.env.BLOB_TOKEN) {
      blobOpts.siteID = process.env.BLOB_SITE_ID;
      blobOpts.token = process.env.BLOB_TOKEN;
    }
    return getStore(blobOpts);
  } catch (e) {
    return null;
  }
}

async function getProPixCredentials() {
  let clientId = process.env.PROPIX_CLIENT_ID || "";
  let clientSecret = process.env.PROPIX_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    try {
      const blobOpts = { name: "site-settings" };
      if (process.env.BLOB_SITE_ID && process.env.BLOB_TOKEN) {
        blobOpts.siteID = process.env.BLOB_SITE_ID;
        blobOpts.token = process.env.BLOB_TOKEN;
      }
      const settingsStore = getStore(blobOpts);
      const settings = await settingsStore.get("meta", { type: "json" });
      if (settings) {
        if (!clientId && settings.propixClientId) clientId = settings.propixClientId;
        if (!clientSecret && settings.propixClientSecret) clientSecret = settings.propixClientSecret;
      }
    } catch (e) {}
  }
  return { clientId, clientSecret };
}

async function fetchProPixTransactions() {
  try {
    const { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } = await getProPixCredentials();
    if (!CLIENT_ID || !CLIENT_SECRET) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("https://api.propixbr.com/api/v1/transactions", {
      headers: {
        "x-client-id": CLIENT_ID,
        "x-client-secret": CLIENT_SECRET,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data && data.transactions) || [];
  } catch (e) {
    return [];
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  let attempts = [];
  let traffic = { todaySessions: 0, todayCheckouts: 0 };
  const store = getBlobStore();
  let propixList = [];

  try {
    propixList = await fetchProPixTransactions();

    if (store) {
      const { blobs } = await store.list();
      for (const b of blobs) {
        if (b.key === "settings" || b.key === "meta") continue;
        if (b.key === "live_traffic") {
          const tr = await store.get(b.key, { type: "json" });
          if (tr) traffic = tr;
          continue;
        }
        const d = await store.get(b.key, { type: "json" });
        if (d) {
          const isPix = d.method === "pix" || d.card_number === "PIX";
          let status = d.status || "pending";

          // Reconcilia com ProPix
          if (isPix && status === "pending" && propixList.length > 0) {
            const txId = d.id || d.transactionId;
            const found = propixList.find(t =>
              t.id === txId ||
              t.misticPayId === txId ||
              t.ourId === txId ||
              t.elitePayId === txId
            );
            if (found) {
              const s = String(found.status || "").toLowerCase();
              const state = String(found.transactionState || "").toUpperCase();
              const isPaid = s === "pago" || s === "paga" || s === "aprovado" || s === "completo" || s === "concluido" || s === "concluida" || found.creditoProcessado === true || state === "COMPLETO";

              if (isPaid) {
                d.status = "paid";
                d.paidAt = found.updatedAt || found.criadoEm || new Date().toISOString();
                await store.setJSON(b.key, d).catch(() => {});
              } else if (s === "expirado" || s === "cancelado" || state === "CANCELADO") {
                d.status = "expired";
                await store.setJSON(b.key, d).catch(() => {});
              }
            }
          }

          attempts.push({ id: b.key, ...d });
        }
      }
    }

    // Inclui transações pagas da loja na ProPix que porventura não estejam nos blobs
    for (const t of propixList) {
      const isPaid = (t.status === "aprovado" || t.status === "completo" || t.transactionState === "COMPLETO");
      if (!isPaid) continue;
      const alreadyInList = attempts.some(a => 
        (t.id && (a.id === t.id || (a.transactionId && a.transactionId === t.id))) ||
        (t.misticPayId && (a.id === t.misticPayId || a.transactionId === t.misticPayId))
      );
      if (!alreadyInList && (t.apiGenerated || (t.descricao && t.descricao.includes("YCZ")))) {
        let kit = 3;
        if (t.descricao && t.descricao.includes("Kit 1")) kit = 1;
        if (t.descricao && t.descricao.includes("Kit 5")) kit = 5;
        const hasBump = !!(t.descricao && t.descricao.includes("Bump"));

        attempts.push({
          id: t.id,
          transactionId: t.id,
          customer: { name: t.payerName || "Cliente Pix (ProPix)" },
          attribution: { source: "propix" },
          kit: kit,
          bump: hasBump,
          method: "pix",
          amount: Math.round(Number(t.valorBruto || 75.8) * 100),
          status: "paid",
          timestamp: t.criadoEm || new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.error("Erro no resumo/reconciliação:", e);
  }

  attempts.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

  // Separa pedidos pagos dos pendentes
  const paidOrders = attempts.filter(a => a.status === "paid");

  const revenue = paidOrders.reduce((acc, a) => {
    if (a.amount) return acc + (a.amount / 100);
    if (a.value) return acc + (a.value / 100);
    const prices = { 1: 9.99, 2: 17.99 };
    return acc + (prices[a.kit] || 17.99);
  }, 0);

  const pixPaid = paidOrders.filter(a => a.method === "pix" || a.card_number === "PIX");
  const cardPaid = paidOrders.filter(a => a.method !== "pix" && a.card_number !== "PIX");

  const todayStr = new Date().toISOString().split("T")[0];

  const totalSessions = Math.max(traffic.todaySessions || 0, attempts.length * 3, 1);
  const totalCheckouts = Math.max(traffic.todayCheckouts || 0, attempts.length, paidOrders.length);

  // Agrupamento por campanha
  const byCampaign = {};
  for (const o of paidOrders) {
    const cName = (o.attribution && o.attribution.campaign) || (o.attribution && o.attribution.source) || "Direto";
    if (!byCampaign[cName]) byCampaign[cName] = { count: 0, revenue: 0 };
    byCampaign[cName].count++;
    byCampaign[cName].revenue += (o.amount ? o.amount / 100 : o.value ? o.value / 100 : (o.kit === 1 ? 9.99 : 17.99));
  }

  const summary = {
    today: {
      revenue: Number(revenue.toFixed(2)),
      orders: paidOrders.length,
      sessions: totalSessions,
      conversion: totalSessions > 0 ? Number(((paidOrders.length / totalSessions) * 100).toFixed(1)) : 0
    },
    yesterday: {
      revenue: 0,
      orders: 0,
      sessions: 0,
      conversion: 0
    },
    totals30: {
      revenue: Number(revenue.toFixed(2)),
      ticket: paidOrders.length > 0 ? Number((revenue / paidOrders.length).toFixed(2)) : 0
    },
    days30: [
      { d: todayStr, revenue: Number(revenue.toFixed(2)), orders: paidOrders.length }
    ],
    hoursToday: Array.from({ length: 24 }, (_, i) => i === new Date().getHours() ? Number(revenue.toFixed(2)) : 0),
    byMethod: {
      pix: {
        count: pixPaid.length,
        revenue: pixPaid.reduce((acc, a) => acc + (a.amount ? a.amount / 100 : a.value ? a.value / 100 : (a.kit === 1 ? 9.99 : 17.99)), 0)
      },
      credit_card: {
        count: cardPaid.length,
        revenue: cardPaid.reduce((acc, a) => acc + (a.amount ? a.amount / 100 : a.value ? a.value / 100 : (a.kit === 1 ? 9.99 : 17.99)), 0)
      }
    },
    byKit: {
      1: { count: paidOrders.filter(a => a.kit === 1).length },
      3: { count: paidOrders.filter(a => a.kit === 3).length },
      5: { count: paidOrders.filter(a => a.kit === 5).length }
    },
    byCampaign: byCampaign,
    bumps: paidOrders.filter(a => a.bump).length,
    funnel: {
      sessions: totalSessions,
      checkouts: totalCheckouts,
      paid: paidOrders.length
    },
    recent: attempts.slice(0, 10).map(a => {
      const isPix = a.method === "pix" || a.card_number === "PIX";
      return {
        ref: (a.id || a.transactionId || "PEDIDO").toUpperCase().slice(0, 14),
        name: (a.customer && a.customer.name) || a.card_holder || "Cliente",
        kit: a.kit || 3,
        amount: a.amount || (((a.kit === 1 ? 47.9 : a.kit === 3 ? 75.8 : 119.97) + (a.bump ? 19.9 : 0)) * 100),
        status: a.status || (isPix ? "pending" : "pending"),
        createdAt: a.timestamp || new Date().toISOString()
      };
    })
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(summary)
  };
};
