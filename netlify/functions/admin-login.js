exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { password } = JSON.parse(event.body || "{}");
    const validPasswords = ["2209", "admin", "admin123", "ycz2026"];
    
    if (validPasswords.includes(String(password || "").trim())) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, token: "ycz-admin-token-2209" })
      };
    }

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Senha incorreta. A senha de acesso é 2209." })
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Erro ao processar login: " + err.message })
    };
  }
};

