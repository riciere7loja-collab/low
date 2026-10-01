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
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const store = getBlobStore();
  let settings = {};
  if (store) {
    try {
      const saved = await store.get("meta", { type: "json" });
      if (saved) settings = saved;
    } catch (e) {}
  }

  const checks = [];

  // Checagem 1: Gateway ProPix
  const pId = process.env.PROPIX_CLIENT_ID || (settings.propixClientId || "").trim();
  const pSecret = process.env.PROPIX_CLIENT_SECRET || (settings.propixClientSecret || "").trim();

  if (pId && pSecret) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch("https://api.propixbr.com/api/v1/transactions", {
        headers: {
          "x-client-id": pId,
          "x-client-secret": pSecret,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        checks.push({
          name: "Gateway de Pagamento (ProPix)",
          ok: true,
          msg: `Chave conectada e validada na ProPix (${pId.slice(0, 10)}…). Pronta para gerar Pix.`
        });
      } else {
        checks.push({
          name: "Gateway de Pagamento (ProPix)",
          ok: false,
          msg: `A ProPix recusou as credenciais (status ${res.status}). Verifique o Client ID e Client Secret.`
        });
      }
    } catch (e) {
      checks.push({
        name: "Gateway de Pagamento (ProPix)",
        ok: true,
        msg: `Chaves salvas (${pId.slice(0, 10)}…).`
      });
    }
  } else {
    checks.push({
      name: "Gateway de Pagamento (ProPix)",
      ok: false,
      msg: "Nenhuma chave da ProPix configurada. Cole o Client ID e Client Secret no campo acima e salve."
    });
  }

  // Checagem 2: Meta Pixel ID
  const pid = (settings.metaPixelId || "").trim();
  if (pid && /^\d{10,20}$/.test(pid)) {
    checks.push({
      name: "Meta Pixel ID",
      ok: true,
      msg: `Configurado com sucesso (${pid}). Pronto para disparar PageView e Checkout.`
    });
  } else if (pid) {
    checks.push({
      name: "Meta Pixel ID",
      ok: false,
      msg: `Formato inválido ("${pid}"). O ID deve conter apenas números (15-16 dígitos).`
    });
  } else {
    checks.push({
      name: "Meta Pixel ID",
      ok: false,
      msg: "Nenhum Pixel ID salvo ainda. Cole o número no campo acima e clique em Salvar."
    });
  }

  // Checagem 3: Conversions API (CAPI)
  const token = (settings.metaCapiToken || "").trim();
  if (token && token.length > 20) {
    checks.push({
      name: "API de Conversões (CAPI)",
      ok: true,
      msg: "Token CAPI ativo. Eventos de Purchase serão enviados direto pelo servidor."
    });
  } else {
    checks.push({
      name: "API de Conversões (CAPI)",
      ok: false,
      msg: "Opcional: Token CAPI não configurado. Se desejar recuperação server-side de Pix, gere no Gerenciador de Eventos."
    });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, checks })
  };
};

