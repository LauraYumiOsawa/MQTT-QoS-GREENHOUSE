/**
 * ESTUFA AGRÍCOLA — PUBLISHER DE SENSORES
 *
 * Sensor 1: Temperatura Ambiente  → tópico: estufa/temp/ambiente  → QoS 0
 *   Justificativa: Dados publicados a cada 5 s; perder uma leitura é aceitável
 *   pois a próxima chega logo em seguida. QoS 0 é o mais leve (fire-and-forget)
 *   e ideal para telemetria de alta frequência sem requisito de entrega garantida.
 *
 * Sensor 2: Nível do Reservatório → tópico: estufa/agua/nivel      → QoS 1
 *   Justificativa: O sistema de irrigação depende dessas leituras; nenhuma pode
 *   ser perdida. QoS 1 garante "pelo menos uma entrega" (at-least-once). Eventuais
 *   duplicatas são inócuas — o monitor simplesmente recebe o valor duas vezes.
 *
 * Sensor 3: Detector de Incêndio → tópico: estufa/alerta/incendio  → QoS 2
 *   Justificativa: O alerta é raro mas crítico; acionar o sistema de extinção
 *   duas vezes pode ser tão perigoso quanto não acioná-lo. QoS 2 garante entrega
 *   "exatamente uma vez" (exactly-once), eliminando tanto perda quanto duplicação.
 */

import mqtt from "mqtt";

// ─── Estatísticas de envio ───────────────────────────────────────────────────
const stats = {
  temp:    { enviadas: 0 },
  agua:    { enviadas: 0 },
  incendio: { enviadas: 0 },
};

// ─── Conexão ─────────────────────────────────────────────────────────────────
// clientId fixo para sessão persistente (necessário para QoS 1/2 offline)
const client = mqtt.connect("mqtt://localhost:1883", {
  clientId: "estufa_pub_sensores",
  clean: false,          // sessão persistente no broker
  reconnectPeriod: 1000,
});

client.on("connect", () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  ESTUFA AGRÍCOLA — Publisher de Sensores     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── Sensor 1: Temperatura (QoS 0) — publica a cada 5 s ──────────────────
  setInterval(() => {
    const temp = (20 + Math.random() * 15).toFixed(1);
    const payload = JSON.stringify({
      sensor: "Temperatura Ambiente",
      valor: parseFloat(temp),
      unidade: "°C",
      qos: 0,
      ts: new Date().toISOString(),
    });
    client.publish("estufa/temp/ambiente", payload, { qos: 0 }, () => {
      stats.temp.enviadas++;
      console.log(`[QoS 0][TEMP   ] Enviada #${stats.temp.enviadas}: ${temp} °C`);
    });
  }, 5000);

  // ── Sensor 2: Nível da Água (QoS 1) — publica a cada 30 s ───────────────
  setInterval(() => {
    const nivel = (30 + Math.random() * 70).toFixed(1);
    const payload = JSON.stringify({
      sensor: "Nível do Reservatório",
      valor: parseFloat(nivel),
      unidade: "%",
      qos: 1,
      ts: new Date().toISOString(),
    });
    client.publish("estufa/agua/nivel", payload, { qos: 1 }, () => {
      stats.agua.enviadas++;
      console.log(`[QoS 1][ÁGUA   ] Enviada #${stats.agua.enviadas}: ${nivel} %`);
    });
  }, 30000);

  // ── Sensor 3: Incêndio (QoS 2) — publica ao detectar fumaça ─────────────
  // Simulação: chance de 15 % a cada 20 s de "detectar" fumaça
  setInterval(() => {
    if (Math.random() < 0.15) {
      const payload = JSON.stringify({
        sensor: "Detector de Incêndio",
        alerta: "FOGO_DETECTADO",
        qos: 2,
        ts: new Date().toISOString(),
      });
      client.publish("estufa/alerta/incendio", payload, { qos: 2 }, () => {
        stats.incendio.enviadas++;
        console.log(`[QoS 2][INCÊNDIO] ⚠ ALERTA ENVIADO #${stats.incendio.enviadas}`);
      });
    }
  }, 20000);

  // ── Relatório periódico de envio ─────────────────────────────────────────
  setInterval(() => {
    console.log("\n─── Relatório do Publisher ───────────────────────");
    console.log(`  Temperatura (QoS 0)  → Enviadas: ${stats.temp.enviadas}`);
    console.log(`  Nível Água (QoS 1)   → Enviadas: ${stats.agua.enviadas}`);
    console.log(`  Incêndio   (QoS 2)   → Enviadas: ${stats.incendio.enviadas}`);
    console.log("──────────────────────────────────────────────────\n");
  }, 60000);
});

client.on("error", (err) => console.error("[PUBLISHER] Erro:", err.message));
client.on("offline", () => console.warn("[PUBLISHER] Offline — aguardando broker..."));
client.on("reconnect", () => console.log("[PUBLISHER] Reconectando..."));
