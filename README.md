# 🌱 MQTT QoS — Desafio Estufa Agrícola

Sistema de monitoramento MQTT para estufa agrícola, desenvolvido como exercício prático de **Quality of Service (QoS)** no protocolo MQTT usando Node.js.

---

## 📋 Desafio Proposto

### Contexto

Você foi contratado para desenvolver um sistema de monitoramento para uma estufa agrícola. O sistema possui **3 sensores** com diferentes níveis de criticidade. Sua missão: escolher o QoS apropriado para cada sensor, implementar e justificar sua escolha.

### Os 3 Sensores

| # | Sensor | Tópico | Frequência | Criticidade |
|---|--------|--------|-----------|------------|
| 1 | Temperatura Ambiente | `estufa/temp/ambiente` | A cada 5 s | 🟢 Não crítico |
| 2 | Nível do Reservatório | `estufa/agua/nivel` | A cada 30 s | 🟡 Importante |
| 3 | Detector de Incêndio | `estufa/alerta/incendio` | Ao detectar fumaça | 🔴 Crítico |

### Requisitos por Sensor

**Sensor 1 — Temperatura Ambiente**
- Dados em tempo real, é **ok perder** algumas leituras
- A próxima leitura chega em 5 s

**Sensor 2 — Nível do Reservatório**
- **Não pode perder** nenhuma leitura (duplicação é aceitável)
- Sistema de irrigação depende desses dados

**Sensor 3 — Detector de Incêndio**
- Mensagem **DEVE chegar exatamente UMA vez** (sem perda, sem duplicação)
- Dispara sistema de extinção automática

---

## 💡 Decisão de QoS

| Sensor | QoS | Garantia | Justificativa |
|--------|-----|----------|---------------|
| Temperatura | **0** | Fire-and-forget | Alta frequência (5 s), perda aceitável, sem overhead de ACK |
| Nível Água | **1** | At-least-once | Zero perda obrigatório; duplicatas inócuas ao controle de irrigação |
| Incêndio | **2** | Exactly-once | Acionar extinção 2× pode ser tão perigoso quanto não acionar |

---

## 🗂️ Estrutura do Projeto

```
mqtt-qos-js-main/
│
├── 📁 src/                         # Código-fonte principal
│   ├── estufa_sensores.js          # Publisher — simula os 3 sensores
│   ├── estufa_monitor.js           # Subscriber — monitora e gera relatório
│   └── estufa_stress.js            # Teste de estresse (falha de rede)
│
├── 📁 tests/                       # Testes automatizados
│   └── estufa_teste.js             # Suite de testes (19 verificações)
│
├── 📁 config/                      # Configurações
│   └── mosquitto.conf              # Broker Mosquitto (persistência habilitada)
│
├── 📁 docs/                        # Documentação
│   └── resultados_stress.md        # Tabela comparativa pós-teste
│
├── docker-compose.yml              # Sobe o broker Mosquitto
├── package.json
└── README.md
```

> **Nota:** Os arquivos `pubQos0.js`, `pubQos1.js`, `pubQos2.js`, `subQos0.js`, etc. são os exemplos originais da aula — mantidos para referência.

---

## 🚀 Como Executar

### Pré-requisitos

- Node.js ≥ 18
- Docker (opcional — se você não tiver o Mosquitto instalado localmente)

### 1. Instalar dependências

```bash
npm install
```

### 2. Subir o broker MQTT

```bash
# Com Docker:
docker compose up -d

# OU com Mosquitto local:
mosquitto -c config/mosquitto.conf
```

### 3. Rodar o sistema (abrir 2 terminais)

```bash
# Terminal 1 — Monitor (subscriber)
node src/estufa_monitor.js

# Terminal 2 — Sensores (publisher)
node src/estufa_sensores.js
```

### 4. Rodar testes automatizados

```bash
node tests/estufa_teste.js
```

### 5. Teste de estresse (falha de rede)

```bash
node src/estufa_stress.js
```

O script orquestra automaticamente:
- **Fase 1 (0–15 s):** Subscriber online — tudo funcionando
- **Fase 2 (15–30 s):** Subscriber offline — publisher continua enviando
- **Fase 3 (30–45 s):** Subscriber reconecta — broker reentrega QoS 1 e 2

---

## 📊 Tabela Comparativa (Parte 2 — Teste de Estresse)

| Sensor | QoS | Enviadas | Recebidas | Perdidas | Duplicadas |
|--------|-----|----------|-----------|---------|------------|
| Temp Ambiente | 0 | N | < N | > 0 | 0 |
| Nível Água | 1 | N | ≥ N | 0 | possível |
| Incêndio | 2 | N | = N | 0 | 0 |

**Legenda:**
- **QoS 0** — Mensagens offline são perdidas (sem armazenamento no broker)
- **QoS 1** — Broker armazena e reentrega ao reconectar (pode duplicar)
- **QoS 2** — Broker armazena e entrega exatamente uma vez (handshake de 4 vias)

---

## 🧪 Resultado dos Testes

```
╔══════════════════════════════════════════════════╗
║  RESULTADO FINAL: 19 PASS   0 FAIL  de 19 verificações  ║
╚══════════════════════════════════════════════════╝

Todos os testes passaram! O sistema está funcionando corretamente.
```

---

## 📦 Dependências

| Pacote | Versão | Uso |
|--------|--------|-----|
| `mqtt` | ^5.0.0 | Cliente MQTT para Node.js |

---

## 🔗 Referências

- [MQTT Specification — QoS Levels](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [Eclipse Mosquitto](https://mosquitto.org/)
- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)
