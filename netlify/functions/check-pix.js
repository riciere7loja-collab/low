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

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const txId = (event.queryStringParameters && event.queryStringParameters.id) || "";
  let currentStatus = "created";

  try {
    const store = getBlobStore("card-attempts");
    if (store && txId) {
      const order = await store.get(txId, { type: "json" });
      if (order && order.status) {
        currentStatus = order.status;
      }
    }
  } catch (e) {
    console.warn("Erro ao checar status do pix:", e.message);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: currentStatus,
      gateway: "cakto"
    })
  };
};
