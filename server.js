const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURAÇÕES
const SANKHYA_URL = 'http://192.168.0.239:8180';
const USUARIO = 'SUP';
const SENHA = 'Sup#ti@88#3448';

// LOGIN NO SANKHYA
async function loginSankhya() {
  const response = await axios.post(`${SANKHYA_URL}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`, {
    serviceName: "MobileLoginSP.login",
    requestBody: {
      NOMUSU: { "$": USUARIO },
      INTERNO: { "$": SENHA },
      KEEPCONNECTED: { "$": "S" }
    }
  }, {
    headers: { 'Content-Type': 'application/json' }
  });

  const jsessionid = response.data.responseBody?.jsessionid?.["$"];
  if (!jsessionid) throw new Error("Login falhou");
  return `JSESSIONID=${jsessionid}`;
}

// ROTA PARA CONSULTAR ITENS DO PEDIDO
app.get('/api/itens-pedido', async (req, res) => {
  const nunota = req.query.nunota;

  if (!nunota) {
    return res.status(400).json({ erro: "Parâmetro 'nunota' é obrigatório na URL." });
  }

  try {
    const sessionId = await loginSankhya();

    const sql = `
      SELECT
        IP.NUNOTA AS NUNOTA,
        P.DESCRPROD AS DESCRPROD,
        IP.QTDNEG AS QTDNEG,
        IP.VLRUNIT AS VLRUNIT
      FROM TGFITE IP
      JOIN TGFPRO P ON P.CODPROD = IP.CODPROD
      WHERE IP.NUNOTA = ${nunota}
    `;


    const consulta = {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: {
        sql,
        outputType: "json"
      }
    };

    const response = await axios.post(
      `${SANKHYA_URL}/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`,
      consulta,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionId
        }
      }
    );

    const linhas = response.data.responseBody?.rows || [];

    const itens = linhas.map(row => ({
      nomeProduto: row[1], // DESCRPROD
      qtd: row[2],         // QTDNEG
      vlrUnit: row[3]      // VLRUNIT
    }));

    res.json({ itens });
    console.log("Linhas recebidas:", response.data.responseBody?.rows);

  } catch (err) {
    console.error("Erro ao consultar itens com DbExplorer:", err.message);
    res.status(500).json({ erro: "Falha ao buscar itens com SQL direto", detalhes: err.message });
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
