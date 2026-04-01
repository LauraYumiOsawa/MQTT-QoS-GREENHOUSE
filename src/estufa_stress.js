/**
 * ESTUFA AGRÍCOLA — TESTE DE ESTRESSE (Simulação de Falha de Rede)
 *
 * Estratégia:
 *  1. Publisher envia mensagens continuamente nos 3 QoS
 *  2. Subscriber inicia, depois desconecta por ~10 s, depois reconecta
 *  3. Ao reconectar, o relatório mostra o que cada QoS entregou (ou perdeu)
 *
 * Resultado esperado:
 *  QoS 0 → Mensagens enviadas durante offline são PERDIDAS (sem reentrega)
 *  QoS 1 → Mensagens armazenadas no broker são REENVIADAS (pode duplicar)
 *  QoS 2 → Mensagens armazenadas são REENVIADAS exatamente UMA vez
 *
 * IMPORTANTE: Para QoS 1/2 funcionar offline é preciso:
 *   - clean: false  no subscriber (sessão persistente)
 *   - clientId fixo no subscriber
 *   - Broker Mosquitto configurado sem limite de mensagens persistentes
 */

import mqtt from "mqtt";

// ─── Contadores globais ───────────────────────────────────────────────────────
const pub = { temp: 0, agua: 0, incendio: 0 };
const sub = {
  "estufa/temp/ambiente":   { nome: "Temp Ambiente", qos: 0, recebidas: 0, duplicadas: 0 },
  "estufa/agua/nivel":      { nome: "Nível Água",    qos: 1, recebidas: 0, duplicadas: 0 },
  "estufa/alerta/incendio": { nome: "Incêndio",      qos: 2, recebidas: 0, duplicadas: 0 },
};
const seenTs = {
  "estufa/temp/ambiente":   new Set(),
  "estufa/agua/nivel":      new Set(),
  "estufa/alerta/incendio": new Set(),
};

// ─── PUBLISHER ────────────────────────────────────────────────────────────────
const publisher = mqtt.connect("mqtt://localhost:1883", {
  clientId: "estufa_stress_pub",
  clean: true,
  reconnectPeriod: 500,
});

publisher.on("connect", () => {
  console.log("[PUB] Conectado — iniciando publicação contínua\n");

  // Temperatura QoS 0 — a cada 3 s (acelerado para stress test)
  setInterval(() => {
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ sensor: "temp", valor: +(20 + Math.random()*15).toFixed(1), ts });
    publisher.publish("estufa/temp/ambiente", payload, { qos: 0 }, () => {
      pub.temp++;
      process.stdout.write(`[PUB][QoS0] temp #${pub.temp}\r`);
    });
  }, 3000);

  // Nível Água QoS 1 — a cada 5 s
  setInterval(() => {
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ sensor: "agua", valor: +(30 + Math.random()*70).toFixed(1), ts });
    publisher.publish("estufa/agua/nivel", payload, { qos: 1 }, () => {
      pub.agua++;
      console.log(`[PUB][QoS1] água #${pub.agua}`);
    });
  }, 5000);

  // Incêndio QoS 2 — a cada 8 s (mais frequente para visualizar no stress test)
  setInterval(() => {
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ sensor: "incendio", alerta: "FUMAÇA", ts });
    publisher.publish("estufa/alerta/incendio", payload, { qos: 2 }, () => {
      pub.incendio++;
      console.log(`[PUB][QoS2] incêndio #${pub.incendio}`);
    });
  }, 8000);
});

publisher.on("error", (e) => console.error("[PUB] Erro:", e.message));

// ─── SUBSCRIBER com sessão persistente ───────────────────────────────────────
function criarSubscriber() {
  const s = mqtt.connect("mqtt://localhost:1883", {
    clientId: "estufa_stress_sub",   // ID fixo — broker mantém fila offline
    clean: false,                    // sessão persistente
    reconnectPeriod: 0,              // desabilita reconexão automática (controlamos manualmente)
  });

  s.on("connect", () => {
    console.log("\n[SUB] Conectado — assinando tópicos com sessão persistente");
    s.subscribe("estufa/temp/ambiente",   { qos: 0 });
    s.subscribe("estufa/agua/nivel",      { qos: 1 });
    s.subscribe("estufa/alerta/incendio", { qos: 2 });
  });

  s.on("message", (topic, rawMsg) => {
    const info = sub[topic];
    if (!info) return;
    let data = {};
    try { data = JSON.parse(rawMsg.toString()); } catch { /**/ }
    const ts = data.ts ?? null;
    let dup = false;
    if (ts) {
      if (seenTs[topic].has(ts)) { dup = true; info.duplicadas++; }
      else seenTs[topic].add(ts);
    }
    info.recebidas++;
    console.log(`[SUB][QoS${info.qos}][${info.nome}] #${info.recebidas}${dup ? " ⟳DUP" : ""}`);
  });

  s.on("error", (e) => console.error("[SUB] Erro:", e.message));
  s.on("offline", () => console.warn("[SUB] Offline"));
  return s;
}

// ─── ORQUESTRAÇÃO DO STRESS TEST ─────────────────────────────────────────────
function imprimirTabela(fase) {
  const totalPubAgua = pub.agua;
  const totalPubInc  = pub.incendio;

  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  TABELA COMPARATIVA — ${fase.padEnd(41)}║`);
  console.log(`╠════════════════╦═════╦══════════╦═══════════╦══════════╦══════════╣`);
  console.log(`║ Sensor         ║ QoS ║ Enviadas ║ Recebidas ║ Perdidas ║ Duplic.  ║`);
  console.log(`╠════════════════╬═════╬══════════╬═══════════╬══════════╬══════════╣`);

  function linha(nome, qos, env, s) {
    const perdidas = Math.max(0, env - s.recebidas + s.duplicadas);
    console.log(
      `║ ${nome.padEnd(14)} ║  ${qos}  ║ ${String(env).padStart(8)} ║ ${String(s.recebidas).padStart(9)} ║ ${String(perdidas).padStart(8)} ║ ${String(s.duplicadas).padStart(8)} ║`
    );
  }

  linha("Temp Ambiente", 0, pub.temp,     sub["estufa/temp/ambiente"]);
  linha("Nível Água",    1, totalPubAgua, sub["estufa/agua/nivel"]);
  linha("Incêndio",      2, totalPubInc,  sub["estufa/alerta/incendio"]);

  console.log(`╚════════════════╩═════╩══════════╩═══════════╩══════════╩══════════╝\n`);
}

// Fase 1: Subscriber ativo por 15 s
let subscriber = criarSubscriber();
console.log("\n=== FASE 1: Subscriber ONLINE por 15 s ===\n");

setTimeout(() => {
  console.log("\n=== FASE 2: Simulando FALHA DE REDE — Subscriber desconectado por 15 s ===");
  console.log("    Publisher continua enviando... QoS 0 perderá mensagens.\n");
  imprimirTabela("Antes da falha");

  subscriber.end(true); // força desconexão

  // Fase 2: offline por 15 s — publisher continua
  setTimeout(() => {
    console.log("\n=== FASE 3: Subscriber RECONECTADO — coletando mensagens retidas ===\n");
    subscriber = criarSubscriber();

    // Fase 3: aguarda 15 s recebendo mensagens retidas, depois imprime relatório final
    setTimeout(() => {
      imprimirTabela("Resultado Final após reconexão");
      console.log("Legenda:");
      console.log("  QoS 0 → Mensagens offline PERDIDAS (sem armazenamento no broker)");
      console.log("  QoS 1 → Mensagens offline REENVIADAS pelo broker (possível duplicação)");
      console.log("  QoS 2 → Mensagens offline REENVIADAS exatamente UMA vez\n");
      subscriber.end();
      publisher.end();
    }, 15000);
  }, 15000);
}, 15000);
