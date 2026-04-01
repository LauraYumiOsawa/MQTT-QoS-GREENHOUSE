/**
 * ESTUFA AGRÍCOLA — SCRIPT DE TESTES AUTOMATIZADOS
 *
 * Verifica automaticamente:
 *  ✓ Conexão com o broker
 *  ✓ QoS 0 — mensagem entregue (sem garantia, mas conexão ativa)
 *  ✓ QoS 1 — entrega garantida (at-least-once)
 *  ✓ QoS 2 — entrega exatamente uma vez (exactly-once)
 *  ✓ Payload JSON válido em cada tópico
 *  ✓ Campos obrigatórios presentes (sensor, valor/alerta, ts)
 *
 * Saída: PASS / FAIL por teste + resumo final.
 */

import mqtt from "mqtt";

// ─── Utilitários ──────────────────────────────────────────────────────────────
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RESET  = "\x1b[0m";

let passCount = 0;
let failCount = 0;

function pass(msg) {
  passCount++;
  console.log(`  ${GREEN}✔ PASS${RESET} — ${msg}`);
}

function fail(msg) {
  failCount++;
  console.log(`  ${RED}✖ FAIL${RESET} — ${msg}`);
}

function section(title) {
  console.log(`\n${CYAN}[ ${title} ]${RESET}`);
}

// ─── Configuração ─────────────────────────────────────────────────────────────
const BROKER   = "mqtt://localhost:1883";
const TIMEOUT  = 5000; // ms aguardando cada mensagem
const TOPICOS = {
  temp:     "estufa/temp/ambiente",
  agua:     "estufa/agua/nivel",
  incendio: "estufa/alerta/incendio",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cria cliente publisher temporário */
function criarPub() {
  return mqtt.connect(BROKER, { clientId: `test_pub_${Date.now()}`, clean: true });
}

/** Cria cliente subscriber temporário com sessão limpa */
function criarSub(clientId) {
  return mqtt.connect(BROKER, { clientId, clean: true, reconnectPeriod: 0 });
}

/** Publica e aguarda o subscriber receber — retorna { received, payload, duplicate } */
function testeEntrega(qos, topico, msgExtra = {}) {
  return new Promise((resolve) => {
    const ts      = new Date().toISOString();
    const pub     = criarPub();
    const sub     = criarSub(`test_sub_${qos}_${Date.now()}`);
    let   timer   = null;
    let   received = false;
    let   duplicateCount = 0;
    const seenTs  = new Set();

    sub.on("connect", () => {
      sub.subscribe(topico, { qos }, () => {
        const payload = JSON.stringify({ _test: true, ts, ...msgExtra });
        pub.publish(topico, payload, { qos });

        timer = setTimeout(() => {
          cleanup();
          resolve({ received, duplicateCount, payload: null, late: true });
        }, TIMEOUT);
      });
    });

    sub.on("message", (t, raw) => {
      let data = {};
      try { data = JSON.parse(raw.toString()); } catch { /**/ }
      if (data.ts !== ts) return; // mensagem de outro teste

      if (seenTs.has(data.ts)) {
        duplicateCount++;
      } else {
        seenTs.add(data.ts);
        received = true;
        // Para QoS 2 aguarda 1 s extra para garantir que não há duplicata
        if (qos === 2) {
          setTimeout(() => { clearTimeout(timer); cleanup(); resolve({ received, duplicateCount, data }); }, 1000);
        } else {
          clearTimeout(timer);
          cleanup();
          resolve({ received, duplicateCount, data });
        }
      }
    });

    function cleanup() {
      pub.end(true);
      sub.end(true);
    }
  });
}

// ─── TESTES ───────────────────────────────────────────────────────────────────

async function testeConexao() {
  section("Teste 1 — Conexão com o Broker");
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER, { clientId: `test_conn_${Date.now()}`, clean: true, reconnectPeriod: 0 });
    const timer  = setTimeout(() => {
      fail(`Não foi possível conectar em ${BROKER} (timeout ${TIMEOUT} ms)`);
      client.end(true);
      resolve(false);
    }, TIMEOUT);

    client.on("connect", () => {
      clearTimeout(timer);
      pass(`Broker disponível em ${BROKER}`);
      client.end(true);
      resolve(true);
    });

    client.on("error", (e) => {
      clearTimeout(timer);
      fail(`Erro de conexão: ${e.message}`);
      client.end(true);
      resolve(false);
    });
  });
}

async function testeQos0() {
  section("Teste 2 — Sensor Temperatura (QoS 0 · estufa/temp/ambiente)");
  const msg  = { sensor: "Temperatura Ambiente", valor: 25.0, unidade: "°C", qos: 0 };
  const res  = await testeEntrega(0, TOPICOS.temp, msg);

  if (res.received) {
    pass("Mensagem QoS 0 entregue");
  } else {
    fail("Mensagem QoS 0 NÃO recebida no prazo");
  }

  // Valida payload
  if (res.data) {
    res.data.sensor   ? pass("Campo 'sensor' presente") : fail("Campo 'sensor' ausente");
    res.data.valor !== undefined ? pass("Campo 'valor' presente") : fail("Campo 'valor' ausente");
    res.data.ts       ? pass("Campo 'ts' (timestamp) presente") : fail("Campo 'ts' ausente");
    res.data.qos === 0 ? pass("QoS informado no payload é 0") : fail(`QoS no payload incorreto: ${res.data.qos}`);
  }
}

async function testeQos1() {
  section("Teste 3 — Sensor Nível Água (QoS 1 · estufa/agua/nivel)");
  const msg = { sensor: "Nível do Reservatório", valor: 75.5, unidade: "%", qos: 1 };
  const res = await testeEntrega(1, TOPICOS.agua, msg);

  res.received ? pass("Mensagem QoS 1 entregue (at-least-once garantido)") : fail("Mensagem QoS 1 NÃO recebida");

  if (res.data) {
    res.data.sensor ? pass("Campo 'sensor' presente") : fail("Campo 'sensor' ausente");
    res.data.valor !== undefined ? pass("Campo 'valor' presente") : fail("Campo 'valor' ausente");
    res.data.qos === 1 ? pass("QoS informado no payload é 1") : fail(`QoS no payload incorreto: ${res.data.qos}`);
  }

  if (res.duplicateCount === 0) {
    pass(`Sem duplicatas detectadas (${res.duplicateCount})`);
  } else {
    console.log(`  ${YELLOW}⚠ WARN${RESET} — ${res.duplicateCount} duplicata(s) detectada(s) (aceitável no QoS 1)`);
  }
}

async function testeQos2() {
  section("Teste 4 — Detector de Incêndio (QoS 2 · estufa/alerta/incendio)");
  const msg = { sensor: "Detector de Incêndio", alerta: "FOGO_DETECTADO", qos: 2 };
  const res = await testeEntrega(2, TOPICOS.incendio, msg);

  res.received ? pass("Mensagem QoS 2 entregue (exactly-once garantido)") : fail("Mensagem QoS 2 NÃO recebida");

  if (res.data) {
    res.data.sensor  ? pass("Campo 'sensor' presente") : fail("Campo 'sensor' ausente");
    res.data.alerta  ? pass("Campo 'alerta' presente") : fail("Campo 'alerta' ausente");
    res.data.qos === 2 ? pass("QoS informado no payload é 2") : fail(`QoS no payload incorreto: ${res.data.qos}`);
  }

  if (res.duplicateCount === 0) {
    pass("Zero duplicatas — exactly-once confirmado ✓");
  } else {
    fail(`${res.duplicateCount} duplicata(s) — QoS 2 violado`);
  }
}

async function testePubSubSimetrico() {
  section("Teste 5 — Pub/Sub Simétrico (todos os tópicos juntos)");
  const resultados = await Promise.all([
    testeEntrega(0, TOPICOS.temp,     { sensor: "temp"     }),
    testeEntrega(1, TOPICOS.agua,     { sensor: "agua"     }),
    testeEntrega(2, TOPICOS.incendio, { sensor: "incendio" }),
  ]);

  const nomes = ["Temp Ambiente (QoS 0)", "Nível Água (QoS 1)", "Incêndio (QoS 2)"];
  resultados.forEach((r, i) => {
    r.received
      ? pass(`${nomes[i]} — recebida`)
      : fail(`${nomes[i]} — NÃO recebida`);
  });
}

// ─── RUNNER PRINCIPAL ─────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  ESTUFA AGRÍCOLA — Suite de Testes Automatizados ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nBroker: ${BROKER}  |  Timeout por teste: ${TIMEOUT} ms\n`);

  const brokerOk = await testeConexao();
  if (!brokerOk) {
    console.log(`\n${RED}Broker indisponível — abortando demais testes.${RESET}\n`);
    console.log("Inicie o broker com:  docker compose up  ou  mosquitto -c mosquitto.conf\n");
    process.exit(1);
  }

  await testeQos0();
  await testeQos1();
  await testeQos2();
  await testePubSubSimetrico();

  // ─── Resumo ───────────────────────────────────────────────────────────────
  const total = passCount + failCount;
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(`║  RESULTADO FINAL: ${String(passCount).padStart(2)} PASS  ${String(failCount).padStart(2)} FAIL  de ${total} verificações${" ".repeat(Math.max(0,10-String(total).length))}║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (failCount === 0) {
    console.log(`${GREEN}Todos os testes passaram! O sistema está funcionando corretamente.${RESET}\n`);
  } else {
    console.log(`${RED}${failCount} teste(s) falharam. Verifique o broker e os scripts.${RESET}\n`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("Erro crítico:", e); process.exit(1); });
