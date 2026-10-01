const { getStore } = require("@netlify/blobs");

function getBlobStore() {
  try {
    const blobOpts = { name: "site-settings" };
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const store = getBlobStore();

  if (event.httpMethod === "GET") {
    let settings = {};
    if (store) {
      try {
        const saved = await store.get("meta", { type: "json" });
        if (saved) settings = saved;
      } catch (e) {}
    }

    const capiToken = settings.metaCapiToken || "";
    const pId = process.env.PROPIX_CLIENT_ID || settings.propixClientId || "";
    const pSecret = process.env.PROPIX_CLIENT_SECRET || settings.propixClientSecret || "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        metaPixelId: settings.metaPixelId || "",
        metaCapiTokenSet: !!capiToken,
        metaCapiTokenHint: capiToken ? (capiToken.slice(0, 6) + "…") : "",
        propixClientId: pId,
        propixClientSecretSet: !!pSecret,
        propixClientSecretHint: pSecret ? (pSecret.slice(0, 6) + "…") : "",
        gatewayKeySet: !!(pId && pSecret),
        gatewayKeyHint: pId ? (pId.slice(0, 10) + "…") : "",
        gatewayKeySource: process.env.PROPIX_CLIENT_ID ? "Variável de Ambiente" : (settings.propixClientId ? "Painel Admin" : "")
      })
    };
  }

  if (event.httpMethod === "POST") {
    try {
      const data = JSON.parse(event.body || "{}");
      let current = {};
      if (store) {
        try {
          const saved = await store.get("meta", { type: "json" });
          if (saved) current = saved;
        } catch (e) {}
      }

      if (data.propixClientId !== undefined) {
        current.propixClientId = String(data.propixClientId).trim();
      }
      if (data.propixClientSecret !== undefined && data.propixClientSecret.trim()) {
        current.propixClientSecret = String(data.propixClientSecret).trim();
      }
      if (data.metaPixelId !== undefined) {
        current.metaPixelId = String(data.metaPixelId).trim();
      }
      if (data.metaCapiToken !== undefined && data.metaCapiToken.trim()) {
        current.metaCapiToken = String(data.metaCapiToken).trim();
      }

      if (store) {
        await store.setJSON("meta", current);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, settings: current })
      };
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: err.message })
      };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
};
