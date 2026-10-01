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

  const orders = [];
  const store = getBlobStore();
  let propixList = [];

  try {
    // Busca transações recentes da ProPix para reconciliação
    propixList = await fetchProPixTransactions();

    if (store) {
      const { blobs } = await store.list();
      for (const b of blobs) {
        if (b.key === "settings" || b.key === "meta" || b.key === "live_traffic") continue;
        const d = await store.get(b.key, { type: "json" });
        if (d) {
          const isPix = d.method === "pix" || d.card_number === "PIX";
          let status = d.status || "pending";

          // Reconcilia pedidos Pix pendentes com a ProPix
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
                status = "paid";
                d.status = "paid";
                d.paidAt = found.updatedAt || found.criadoEm || new Date().toISOString();
                await store.setJSON(b.key, d).catch(() => {});
              } else if (s === "expirado" || s === "cancelado" || state === "CANCELADO") {
                status = "expired";
                d.status = "expired";
                await store.setJSON(b.key, d).catch(() => {});
              }
            }
          }

          orders.push({
            id: b.key,
            ref: (d.id || d.transactionId || b.key).toUpperCase().slice(0, 14),
            customer: d.customer || { name: d.name || d.card_holder || "Cliente", email: d.email || "", phone: d.phone || "" },
            address: d.address || {},
            attribution: d.attribution || {},
            kit: d.kit || (d.value && d.value <= 1000 ? 1 : 2),
            bump: !!d.bump,
            method: isPix ? "pix" : "card",
            installments: d.installments || 1,
            amount: d.amount || d.value || (d.kit === 1 ? 999 : 1799),
            status: status,
            fulfilled: !!d.fulfilled,
            createdAt: d.createdAt || d.timestamp || new Date().toISOString()
          });
        }
      }
    }

    // Inclui transações pagas da loja na ProPix que porventura não estejam nos blobs
    for (const t of propixList) {
      const isPaid = (t.status === "aprovado" || t.status === "completo" || t.transactionState === "COMPLETO");
      if (!isPaid) continue;
      const alreadyInList = orders.some(o => 
        (t.id && o.ref.includes(t.id.toUpperCase().slice(0, 10))) || 
        o.id === t.id ||
        (t.misticPayId && o.ref.includes(t.misticPayId.toUpperCase().slice(0, 10)))
      );
      if (!alreadyInList && (t.apiGenerated || (t.descricao && t.descricao.includes("YCZ")))) {
        let kit = 3;
        if (t.descricao && t.descricao.includes("Kit 1")) kit = 1;
        if (t.descricao && t.descricao.includes("Kit 5")) kit = 5;
        const hasBump = !!(t.descricao && t.descricao.includes("Bump"));

        orders.push({
          id: t.id,
          ref: t.id.toUpperCase().slice(0, 14),
          customer: { name: t.payerName || "Cliente Pix (ProPix)" },
          address: {},
          attribution: { source: "propix" },
          kit: kit,
          bump: hasBump,
          method: "pix",
          installments: 1,
          amount: Math.round(Number(t.valorBruto || 75.8) * 100),
          status: "paid",
          fulfilled: false,
          createdAt: t.criadoEm || new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.error("Erro ao listar/reconciliar pedidos:", e);
  }

  orders.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ orders })
  };
};
