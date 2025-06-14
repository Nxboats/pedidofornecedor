const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const SANKHYA_URL = 'http://sankhya2.nxboats.com.br:8180';
const USUARIO = 'SUP';
const SENHA = 'Sup#ti@88#3448';

async function loginSankhya() {
  const response = await axios.post(
    `${SANKHYA_URL}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`,
    {
      serviceName: "MobileLoginSP.login",
      requestBody: {
        NOMUSU: { "$": USUARIO },
        INTERNO: { "$": SENHA },
        KEEPCONNECTED: { "$": "S" }
      }
    },
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const jsessionid = response.data.responseBody?.jsessionid?.["$"];
  if (!jsessionid) throw new Error("Login falhou");
  return `JSESSIONID=${jsessionid}`;
}

// Endpoint para consultar itens do pedido
app.get('/api/itens-pedido', async (req, res) => {
  const nunota = req.query.nunota;
  if (!nunota) return res.status(400).json({ erro: "Parâmetro 'nunota' é obrigatório" });

  try {
    const sessionId = await loginSankhya();

    const sql = `
      SELECT IP.NUNOTA, CAST(P.DESCRPROD AS VARCHAR(4000)), IP.QTDNEG, IP.VLRUNIT,
             NVL(PAP.CODPROPARC,'Sem Referencia')
      FROM TGFITE IP
      JOIN TGFCAB C ON C.NUNOTA = IP.NUNOTA
      JOIN TGFPRO P ON P.CODPROD = IP.CODPROD
      LEFT JOIN TGFPAP PAP ON IP.CODPROD = PAP.CODPROD AND C.CODPARC = PAP.CODPARC
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

    const itens = response.data.responseBody?.rows.map(row => ({
      nomeProduto: String(row[1]).normalize('NFC'),
      qtd: row[2],
      vlrUnit: row[3],
      codProparc: row[4]
    })) || [];

    res.json({ itens });
  } catch (error) {
    console.error("Erro ao buscar itens:", error.message);
    res.status(500).json({ erro: "Erro ao buscar itens", detalhes: error.message });
  }
});

// Endpoint para consultar o cabeçalho do pedido
app.get('/api/cabecalho-pedido', async (req, res) => {
  const nunota = req.query.nunota;
  if (!nunota) return res.status(400).json({ erro: "Parâmetro 'nunota' é obrigatório" });

  try {
    const sessionId = await loginSankhya();

    const sql = `
      SELECT CAB.CODPARC || ' - ' || PAR.RAZAOSOCIAL, ENDE.TIPO || ' ' || ENDE.NOMEEND || ', ' || PAR.NUMEND,
             PAR.CEP, CID.NOMECID || '-' || UFS.UF, Formatar_Cpf_Cnpj(PAR.CGC_CPF),
             PAR.IDENTINSCESTAD, PAR.CODVEND || ' - ' || VEN.APELIDO, CAB.DTNEG, CAB.NUNOTA
      FROM TGFCAB CAB
      JOIN TGFPAR PAR ON PAR.CODPARC = CAB.CODPARC
      JOIN TSIEND ENDE ON ENDE.CODEND = PAR.CODEND
      LEFT JOIN TSICID CID ON CID.CODCID = PAR.CODCID
      LEFT JOIN TSIUFS UFS ON UFS.CODUF = CID.UF
      LEFT JOIN TGFVEN VEN ON VEN.CODVEND = PAR.CODVEND
      WHERE CAB.NUNOTA = ${nunota}
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

    const row = response.data.responseBody?.rows?.[0];
    if (!row) return res.status(404).json({ erro: "Cabeçalho não encontrado." });

    const cabecalho = {
      parceiro: row[0], endereco: row[1], cep: row[2], cidade: row[3],
      cgc: row[4], rgIe: row[5], vendedor: row[6],
      dataNegociacao: row[7], nunota: row[8]
    };

    res.json(cabecalho);
  } catch (error) {
    console.error("Erro ao buscar cabeçalho:", error.message);
    res.status(500).json({ erro: "Erro ao buscar cabeçalho", detalhes: error.message });
  }
});

// Endpoint para confirmar pedido
app.post('/api/confirmar-pedido', async (req, res) => {
  const { nunota, observacao, email, dataEntrega } = req.body;
  console.log("➡️ Dados recebidos do front:", req.body);

  if (!nunota || !observacao || !email || !dataEntrega) {
    return res.status(400).json({ erro: "Todos os campos são obrigatórios: nunota, observacao, email, dataEntrega" });
  }

  try {
    const sessionId = await loginSankhya();

    const payload = {
      serviceName: "DatasetSP.save",
      requestBody: {
        entityName: "CabecalhoNota",
        fields: ["AD_OBSFORNDT", "AD_EMAILFORNDT", "DTPREVENT"],
        records: [
          {
            pk: { NUNOTA: nunota },
            values: {
              "0": observacao,
              "1": email,
              "2": dataEntrega
            }
          }
        ]
      }
    };

    const response = await axios.post(
      `${SANKHYA_URL}/mge/service.sbr?serviceName=DatasetSP.save&outputType=json`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionId
        }
      }
    );

    res.status(200).json({ sucesso: true, dados: response.data });
  } catch (error) {
    console.error("Erro ao confirmar pedido:", JSON.stringify(error?.response?.data || error.message, null, 2));
    res.status(500).json({ erro: "Erro ao confirmar pedido", detalhes: error?.response?.data || error.message });
  }
});
app.listen(3000, '0.0.0.0', () => {
  console.log("Servidor rodando na porta 3000 e acessível remotamente");
});
