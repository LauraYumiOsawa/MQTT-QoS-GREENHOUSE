/**
 * ESTUFA AGRÍCOLA — SUBSCRIBER / MONITOR
 *
 * Monitora os 3 tópicos com o respectivo QoS de assinatura e gera relatório
 * comparativo (mensagens esperadas vs recebidas vs duplicadas).
 */

import mqtt from "mqtt";

// ─── Tabela de estatísticas ───────────────────────────────────────────────────
const stats = {
  "estufa/temp/ambiente":   { nome: "Temp Ambiente", qos: 0, recebidas: 0, duplicadas: 0, ultimoTs: null },
  "estufa/agua/nivel":      { nome: "Nível Água",    qos: 1, recebidas: 0, duplicadas: 0, ultimoTs: null },
  "estufa/alerta/incendio": { nome: "Incêndio",      qos: 2, recebidas: 0, duplicadas: 0, ultimoTs: null },
};

// Rastreia timestamps para detectar duplicatas (mesma ts = duplicata QoS 1)
const seenTs = {
  "estufa/temp/ambiente":   new Set(),
  "estufa/agua/nivel":      new Set(),
  "estufa/alerta/incendio": new Set(),
};

// ─── Conexão ─────────────────────────────────────────────────────────────────
const client = mqtt.connect("mqtt://localhost:1883", {
  clientId: "estufa_monitor_sub",
  clean: false,          // sessão persistente: broker armazena msgs QoS 1/2 offline
  reconnectPeriod: 1000,
});

client.on("connect", () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  ESTUFA AGRÍCOLA — Monitor / Subscriber      ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Assina cada tópico com o QoS correspondente
  client.subscribe("estufa/temp/ambiente",   { qos: 0 });
  client.subscribe("estufa/agua/nivel",      { qos: 1 });
  client.subscribe("estufa/alerta/incendio", { qos: 2 });

  console.log("Assinando tópicos:\n");
  console.log("  estufa/temp/ambiente   → QoS 0");
  console.log("  estufa/agua/nivel      → QoS 1");
  console.log("  estufa/alerta/incendio → QoS 2\n");
});

// ─── Tratamento de mensagens ──────────────────────────────────────────────────
client.on("message", (topic, rawMsg) => {
  const s = stats[topic];
  if (!s) return;

  let data = {};
  try { data = JSON.parse(rawMsg.toString()); } catch { /* mensagem mal-formada */ }

  const ts = data.ts ?? null;
  let isDuplicate = false;

  if (ts) {
    if (seenTs[topic].has(ts)) {
      isDuplicate = true;
      s.duplicadas++;
    } else {
      seenTs[topic].add(ts);
    }
  }

  s.recebidas++;
  s.ultimoTs = ts;

  const dupLabel = isDuplicate ? " ⟳ DUPLICATA" : "";

  if (topic === "estufa/alerta/incendio") {
    console.log(`\n🔥 [QoS ${s.qos}][${s.nome.toUpperCase()}] ALERTA #${s.recebidas}${dupLabel}`);
    console.log(`   → Ação: Sistema de extinção ACIONADO`);
  } else if (topic === "estufa/agua/nivel") {
    console.log(`[QoS ${s.qos}][${s.nome}] Recebida #${s.recebidas}: ${data.valor} ${data.unidade ?? ""}${dupLabel}`);
    if (data.valor < 40) console.log(`   ⚠ Nível baixo — Irrigação ativada`);
  } else {
    console.log(`[QoS ${s.qos}][${s.nome}] Recebida #${s.recebidas}: ${data.valor} ${data.unidade ?? ""}${dupLabel}`);
  }
});

// ─── Relatório comparativo periódico ─────────────────────────────────────────
function printRelatorio() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║            RELATÓRIO COMPARATIVO — MENSAGENS                   ║");
  console.log("╠══════════════════╦═════╦══════════╦═══════════╦════════════╣");
  console.log("║ Sensor           ║ QoS ║ Recebidas║ Duplicadas║ Observação ║");
  console.log("╠══════════════════╬═════╬══════════╬═══════════╬════════════╣");

  for (const [, s] of Object.entries(stats)) {
    const nome = s.nome.padEnd(16);
    const qos  = String(s.qos).padStart(3);
    const rec  = String(s.recebidas).padStart(8);
    const dup  = String(s.duplicadas).padStart(9);
    const obs  = s.qos === 0 ? "Pode perder" :
                 s.qos === 1 ? "≥1 entrega " :
                               "Exato 1x   ";
    console.log(`║ ${nome} ║ ${qos} ║ ${rec} ║ ${dup} ║ ${obs} ║`);
  }

  console.log("╚══════════════════╩═════╩══════════╩═══════════╩════════════╝\n");
}

setInterval(printRelatorio, 60000);

client.on("offline",   () => console.warn("\n[MONITOR] ⚡ Offline — broker desconectado"));
client.on("reconnect", () => console.log("[MONITOR] 🔄 Reconectando ao broker..."));
client.on("error",     (e) => console.error("[MONITOR] Erro:", e.message));
