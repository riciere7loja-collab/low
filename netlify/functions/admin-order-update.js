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

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const { ref, fulfilled, tracking } = JSON.parse(event.body || "{}");
    const store = getBlobStore();
    if (!store) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stored: false }) };
    }

    const { blobs } = await store.list();
    for (const b of blobs) {
      if (b.key === "settings" || b.key === "meta" || b.key === "live_traffic") continue;
      const item = await store.get(b.key, { type: "json" });
      if (
        item && (
          (item.id && item.id.toUpperCase().slice(0, 14) === ref) ||
          (item.transactionId && item.transactionId.toUpperCase().slice(0, 14) === ref) ||
          b.key === ref ||
          b.key.toUpperCase().slice(0, 14) === ref
        )
      ) {
        item.fulfilled = !!fulfilled;
        if (tracking !== undefined) item.tracking = String(tracking).trim();
        await store.setJSON(b.key, item);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, order: item }) };
      }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Pedido não encontrado" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
