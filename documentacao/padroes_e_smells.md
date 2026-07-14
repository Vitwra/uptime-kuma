# Padrões de Projeto, Code Smells e Refatoração

> **CSI410 – Engenharia de Software II** — UFOP / ICEA / DECSI
> Professor: Igor Muzetti Pereira — Semestre 2026/1
>
> **Projeto analisado:** [Uptime Kuma](https://github.com/louislam/uptime-kuma)
> **Versão:** `2.4.0` — **Commit base:** `62a2d01d3f2eb6df47e1c987b7819bead6a91e2e` (13/07/2026)
> **Fork:** https://github.com/Vitwra/uptime-kuma
>
> **Dupla:** `Eduarda Gomes Camilo` e `Vitor Angelo dos Santos`

---

## Sumário

- [1. Metodologia](#1-metodologia)
- [2. Code smells identificados](#2-code-smells-identificados)
  - [2.1. God Class](#21-god-class--servermodelmonitorjs)
  - [2.2. Switch Statements / Conditional Complexity](#22-switch-statements--conditional-complexity)
  - [2.3. Efeito colateral escondido em `validate()`](#23-efeito-colateral-escondido-em-validate)
  - [2.4. Assertion abuse](#24-assertion-abuse--asserção-defensiva-que-virou-o-caso-normal)
  - [2.5. Dependência circular](#25-dependência-circular)
  - [2.6. Migration com estado](#26-migration-com-estado)
- [3. Padrões de projeto identificados](#3-padrões-de-projeto-identificados)
- [4. Refatorações aplicadas](#4-refatorações-aplicadas)
- [5. Trabalho futuro](#5-trabalho-futuro)

---

## 1. Metodologia

A análise combinou três fontes de evidência:

1. **Análise estática** — execução do ESLint já configurado no projeto (`npm run lint:js`), que reporta **0 erros e 72 warnings** na base original.
2. **Leitura dirigida do código** — a partir da arquitetura mapeada em [`arquitetura.md`](./arquitetura.md), concentramos a leitura no núcleo do domínio (`server/model/monitor.js`) e no subsistema de expiração de domínio (`server/model/domain_expiry.js`).
3. **Instrumentação em tempo de execução** — para os smells que envolviam comportamento dinâmico (seção 2.4), inserimos logs temporários e observamos a aplicação rodando.

Os smells abaixo **não são hipotéticos**: todos foram verificados no código do commit base, e três deles foram efetivamente corrigidos nos PRs desta entrega.

---

## 2. Code smells identificados

### 2.1. God Class — `server/model/monitor.js`

**Trecho / evidência**

```powershell
PS> (Get-Content server\model\monitor.js).Count
2069
```

Um único arquivo, uma única classe (`Monitor extends BeanModel`), acumulando:

| Responsabilidade | Evidência |
|---|---|
| Representação da entidade | `toJSON()`, `toPublicJSON()`, dezenas de getters |
| Agendamento do ciclo de vida | `start()`, `stop()`, `setTimeout(safeBeat, ...)` |
| Execução da verificação | o `beat()`, com a cadeia condicional por tipo |
| Avaliação de mudança de estado | `isImportantBeat()`, `isImportantForNotification()` |
| Disparo de notificações | `sendNotification()`, `sendCertNotificationByTargetDays()` |
| Persistência | herdada do Active Record (`R.store`, `R.find`) |
| Validação de configuração | `validate()` |

**Problema identificado**

Violação frontal do **Princípio da Responsabilidade Única (SRP)**. A classe tem pelo menos sete motivos distintos para mudar. Qualquer alteração — um novo tipo de monitor, uma nova regra de notificação, uma mudança na lógica de retry — passa obrigatoriamente por este arquivo.

Isso é consequência direta da arquitetura descrita em `arquitetura.md`: um monólito com **Active Record** e sem fronteiras internas não impõe disciplina alguma, e as responsabilidades vazam por gravidade para o objeto de domínio central.

**Solução proposta**

Extração de responsabilidades para colaboradores dedicados: um `MonitorScheduler` (agendamento), um `MonitorNotifier` (notificações) e a conclusão da migração para o padrão **Strategy** (execução por tipo).

**Solução aplicada:** o PR de refatoração (seção 4) atacou a terceira frente, removendo **61 linhas líquidas** e 13 símbolos do arquivo. As duas primeiras permanecem como trabalho futuro — o escopo foi limitado deliberadamente (ver seção 5).

---

### 2.2. Switch Statements / Conditional Complexity

Este é o smell central do projeto, e ele aparece **duas vezes**, em métodos diferentes, pelo mesmo motivo.

#### 2.2.1. No método `beat()`

**Trecho**

```js
} else if (this.type === "http" || this.type === "keyword" || this.type === "json-query") {
    // ~250 linhas: montagem de agentes HTTP, autenticação, proxy, TLS, axios…
    if (this.type === "http") {
        bean.status = UP;
    } else if (this.type === "keyword") {
        // ...
    } else if (this.type === "json-query") {
        // ...
    }
} else if (this.type === "ping") {
    // ...
} else if (this.type === "push") {
    // ...
} else if (this.type === "docker") {
    // ...
} else if (this.type === "radius") {
    // ...
} else if (this.type in UptimeKumaServer.monitorTypeList) {   // ← a Strategy
    const monitorType = UptimeKumaServer.monitorTypeList[this.type];
    await monitorType.check(this, bean, UptimeKumaServer.getInstance());
} else if (this.type === "kafka-producer") {
    // ...
} else {
    throw new Error("Unknown Monitor Type");
}
```

Localização das condições no arquivo original:

```powershell
PS> Select-String -Path server\model\monitor.js -Pattern 'this\.type ===' | Select-Object LineNumber
# 119, 440, 469, 677, 679, 705, 724, 736, 774, 838, 879, 925, 1103, 1695, 1736, 1758
```

O bloco das linhas **440 a 925** é uma cadeia `if / else if` de aproximadamente **500 linhas** dentro de um único método.

**Problema identificado**

Violação do **Princípio Aberto/Fechado (OCP)**: não é possível adicionar um tipo de monitor sem **modificar** o `monitor.js`.

O achado mais relevante, porém, é este: **o projeto já reconheceu o problema e começou a resolvê-lo — sem concluir.** O diretório `server/monitor-types/` contém a interface `MonitorType` e **24 implementações** concretas. Mas note *quais* tipos foram migrados e quais não foram:

| Migrados para a Strategy (periféricos) | Ainda no condicional (caminho quente) |
|---|---|
| `dns`, `mqtt`, `mongodb`, `postgres`, `redis`, `snmp`, `steam`, `rabbitmq`, `tcp`, `grpc`, `smtp`, `gamedig`, `oracledb`, `mysql`, `mssql`, `sip-options`, `system-service`, `globalping`, `manual`, `group`, `tailscale-ping`, `websocket-upgrade`, `real-browser` | **`http`**, **`keyword`**, **`json-query`**, **`ping`**, **`push`**, **`docker`**, **`radius`**, **`kafka-producer`** |

Extraiu-se tudo o que era **periférico**, e deixou-se no condicional exatamente o **caminho mais executado do produto** (o monitor HTTP é o padrão, criado pela esmagadora maioria dos usuários).

Pior: os dois mecanismos **coexistem no mesmo `if/else if`**. A Strategy não substituiu o condicional — ela virou apenas mais um ramo dele, o penúltimo.

**Evidência da degradação em curso.** A linha 925 mostra o condicional perdendo coesão:

```js
} else if (this.type === "json-query" && this.retry_only_on_status_code_failure) {
```

A condição já não é mais "qual é o tipo do monitor" — ela **mistura tipo com regra de negócio de retry**. É assim que um condicional degenera: cada funcionalidade nova acrescenta mais uma cláusula, e o comportamento por tipo deixa de ser isolável.

**Solução aplicada:** concluímos a migração para o tipo `ping` (ver seção 4).

#### 2.2.2. No método `validate()`

O mesmo smell, replicado em outro método:

```js
validate() {
    // validações genéricas: interval, retryInterval, JSON de headers, conditions…

    if (this.type === "ping") {
        // ~40 linhas: packetSize, ping_count, ping_per_request_timeout, timeout global
    }

    if (this.type === "real-browser") {
        // screenshot_delay
    }

    if (this.type === "mongodb" && this.databaseQuery) {
        // JSON do databaseQuery
    }
}
```

**Problema identificado**

Um método de validação genérico **não deveria conhecer tipos concretos**. Aqui, três tipos específicos estão enfiados no meio de validações que valem para qualquer monitor. É o mesmo smell da God Class, em miniatura — e note que o `real-browser` e o `mongodb` **já eram Strategies** e ainda assim tinham sua validação hard-coded aqui.

**Solução aplicada:** estendemos o contrato `MonitorType` com um método `validate()` e substituímos o bloco do `ping` por uma **delegação genérica** (seção 4).

---

### 2.3. Efeito colateral escondido em `validate()`

**Trecho** (`server/model/monitor.js`, método `validate()`, versão original)

```js
if (this.timeout) {
    const pingGlobalTimeout = Math.round(Number(this.timeout));

    if (pingGlobalTimeout < this.ping_per_request_timeout ||
        pingGlobalTimeout < PING_GLOBAL_TIMEOUT_MIN ||
        pingGlobalTimeout > PING_GLOBAL_TIMEOUT_MAX) {
        throw new Error(`Timeout must be between ...`);
    }

    this.timeout = pingGlobalTimeout;    // ← MUTAÇÃO, não validação
}
```

**Problema identificado**

Um método chamado `validate()` **modifica o estado do objeto**. Ele arredonda o `timeout` e o grava de volta. Isso viola o **princípio da menor surpresa**: nenhum chamador espera que "validar" altere o que está sendo validado.

O nome mente sobre o que o método faz. Quem lê `monitor.validate()` no socket handler não tem como saber que o objeto sai de lá diferente de como entrou.

**Solução proposta**

Separar em `validate()` (puro, apenas lança exceção) e `normalize()` (transformação explícita), chamados em sequência pelo handler.

**Decisão tomada:** **preservamos o comportamento** ao mover a lógica para `PingMonitorType.validate()`. Alterar isso mudaria o comportamento observável do sistema e está fora do escopo de uma refatoração — que, por definição, não deve alterar comportamento. Registramos o smell e o propomos como trabalho futuro. **Esta é uma decisão consciente, não uma omissão.**

---

### 2.4. Assertion abuse — asserção defensiva que virou o caso normal

**Trecho** (`server/model/domain_expiry.js`, método `sendNotifications()`)

```js
// sanity check if expiry date is valid before calculating days remaining.
// Should not happen and likely indicates a bug in the code.
if (!domain.expiry || isNaN(new Date(domain.expiry).getTime())) {
    log.warn(
        "domain_expiry",
        `No valid expiry date passed to sendNotifications for ${domainName} (expiry: ${domain.expiry}), skipping notification`
    );
    return;
}
```

**Problema identificado**

Os desenvolvedores escreveram uma **asserção defensiva** — um bloco que, segundo o próprio comentário, *"não deveria acontecer e provavelmente indica um bug no código"*. Usaram `log.warn` justamente porque, no modelo mental deles, chegar ali seria uma anomalia.

**A anomalia era o caso normal.** Domínios cujo servidor RDAP responde mas **não publica data de expiração** (como o `.no`, via `rdap.norid.no`) atingiam essa linha em **todo heartbeat** — a cada 60 segundos, indefinidamente.

**Causa raiz** (identificada por instrumentação em tempo de execução):

1. `getExpiryDate()` retorna `null` quando o RDAP não traz a data
2. O código persiste esse `null` via `R.isoDateTimeMillis(null)`, que produz **a string `"Invalid Date"`** — não `null`, não `undefined`
3. A guarda `if (expiryDate === null) return;` existia, mas rodava **depois** do `R.store(bean)` — o banco já estava contaminado
4. Nas 24h seguintes, o **cache** devolvia o valor persistido sem validar: `return bean.expiry`
5. Uma string não-vazia é **truthy** em JavaScript, logo a guarda do chamador (`if (domainExpiryDate)` em `monitor.js:1005`) era **derrotada por coerção de tipo**

Evidência coletada com instrumentação temporária:

```
[DOMAIN_EXPIRY] DEBUG: valor=Invalid Date | tipo=string | truthy=true
```

O esquema do banco **já previa** o estado correto: a coluna `expiry` é nullable (`table.datetime("expiry")`, sem `.notNullable()`, ao contrário de `domain`). Era o código de aplicação que não honrava o próprio esquema.

**Solução aplicada:** corrigimos na escrita (persistir `NULL`) e na leitura (validar o cache antes de devolver). Ver seção 4.

---

### 2.5. Dependência circular

**Trecho** (`server/uptime-kuma-server.js`)

```js
const { isSSL, sslKey, sslCert, sslKeyPassphrase } = require("./config");
// DO NOT IMPORT HERE IF THE MODULES USED `UptimeKumaServer.getInstance()`,
// put at the bottom of this file instead.

// ... 600 linhas de classe ...

module.exports = { UptimeKumaServer };

// Must be at the end to avoid circular dependencies
const { RealBrowserMonitorType } = require("./monitor-types/real-browser-monitor-type");
const { DnsMonitorType } = require("./monitor-types/dns");
// ... mais 22 requires ...
const Monitor = require("./model/monitor");
```

**Problema identificado**

Um arquivo que precisa de um comentário **em caixa alta** avisando "NÃO IMPORTE AQUI" é um sintoma, não uma solução. O ciclo é real: `uptime-kuma-server.js` → `monitor-types/*` → `util-server` → `uptime-kuma-server.js`.

A técnica de mover os `require` para o rodapé **contorna** o problema (o Node resolve o módulo tardiamente, e as classes só são necessárias quando o `constructor()` executa) — mas o acoplamento circular continua lá, e a solução é frágil: depende de um comentário e da disciplina de quem edita o arquivo.

Este smell nos afetou diretamente: ao registrar o `PingMonitorType`, o import foi inicialmente colocado no topo, e teve de ser movido para o rodapé.

**Solução proposta**

Injeção de dependência: o servidor recebe as Strategies em vez de importá-las, ou um módulo de registro (`monitor-types/index.js`) que centraliza os imports e é consumido pelo servidor sem retorno de referência.

---

### 2.6. Migration com estado

**Trecho** (`db/knex_migrations/2026-02-07-0000-disable-domain-expiry-unsupported-tlds.js`)

```js
/*
 * TODO:
 *  This migration file is scary, because the json file is dynamically updated.
 *  Problem 1: Migration files should ideally be stateless.
 *  Problem 2: This migration only runs once, what happens if rdp-dns.json is
 *             updated after this migration has run?
 *  Have to investigate later.
 */
const rdapDnsData = require("../../extra/rdap-dns.json");
```

**Problema identificado**

O smell foi **documentado pelos próprios mantenedores**, o que o torna incontestável. Uma migration deve ser determinística e imutável: rodar a mesma migration em dois momentos diferentes deve produzir o mesmo resultado. Esta lê um arquivo JSON que é atualizado dinamicamente, tornando o resultado dependente de *quando* a migration rodou.

**Relevância para nossa análise:** essa migration desabilita a checagem de expiração para TLDs **sem endpoint RDAP**. O `.no` **tem** endpoint RDAP registrado na IANA — ele apenas não retorna a data. Existe portanto um **terceiro estado que o sistema não modela**:

| Estado | Tratamento no projeto |
|---|---|
| TLD sem endpoint RDAP | Migration desabilita a flag + aviso explicativo (commit `919f0801`) |
| TLD com RDAP que retorna data | Funciona normalmente |
| **TLD com RDAP que responde mas não traz data** | ❌ **não modelado** → gerava o bug da seção 2.4 |

---

## 3. Padrões de projeto identificados

### 3.1. Strategy ⭐

**Onde:** `server/monitor-types/` — interface `MonitorType` + 24 implementações concretas.

```js
class MonitorType {
    name = undefined;
    async check(monitor, heartbeat, server) {
        throw new Error("You need to override check()");
    }
}
```

**Justificativa:** o sistema precisa executar algoritmos de verificação radicalmente diferentes (requisição HTTP, conexão TCP, consulta DNS, query SQL, ping ICMP…) sob uma mesma interface. Strategy é a resposta canônica: cada tipo encapsula seu próprio algoritmo, e o contexto (`Monitor`) delega sem conhecer os detalhes.

**Contrato notável:** o `check()` **não retorna valor**. Ele muta o `heartbeat` em caso de sucesso e **lança exceção** em caso de falha. O tratamento de erro, retry e transição de estado fica todo no `try/catch` do `beat()`, o que mantém as Strategies simples.

**Este é o padrão que estendemos** (seção 4).

### 3.2. Active Record

**Onde:** `server/model/` (`monitor.js`, `heartbeat.js`, `user.js`, `domain_expiry.js`), sobre a biblioteca RedBean (`class Monitor extends BeanModel`).

**Justificativa:** o objeto de domínio conhece sua própria persistência (`R.store(bean)`, `R.findOne(...)`). É uma escolha pragmática, coerente com o público-alvo do produto (self-hosting simples, sem camada de repositório).

**Ressalva crítica:** é também a raiz do smell 2.1. Active Record concentra domínio e persistência na mesma classe por definição — o que funciona bem em objetos pequenos e degenera em God Class quando o objeto cresce.

### 3.3. Observer

**Onde:** a fronteira cliente-servidor, via Socket.IO.

```js
io.to(this.user_id).emit("heartbeat", bean.toJSON());
```

**Justificativa:** o domínio é intrinsecamente *push* — heartbeats são produzidos continuamente, sem que o usuário solicite. O servidor **notifica** os observadores (clientes conectados) quando o estado muda, em vez de esperar por requisições. É Observer aplicado na fronteira da rede, e é o que permite o dashboard em tempo real sem polling.

### 3.4. Singleton

**Onde:** `server/uptime-kuma-server.js`

```js
static getInstance() {
    if (UptimeKumaServer.instance == null) {
        UptimeKumaServer.instance = new UptimeKumaServer();
    }
    return UptimeKumaServer.instance;
}
```

**Justificativa:** há um único servidor por processo, e ele detém recursos compartilhados (a instância do Socket.IO, a lista de monitores ativos, o registro de tipos).

**Ressalva:** o Singleton é também o que torna a dependência circular da seção 2.5 possível — qualquer módulo pode alcançar o servidor via `getInstance()`, criando acoplamento invisível. É um padrão que resolve um problema e habilita outro.

### 3.5. Factory / Registry

**Onde:** `UptimeKumaServer.monitorTypeList`

```js
static monitorTypeList = {};
// ...
UptimeKumaServer.monitorTypeList["dns"] = new DnsMonitorType();
UptimeKumaServer.monitorTypeList["smtp"] = new SMTPMonitorType();
// ... 24 registros
```

**Justificativa:** um registro chave→instância que mapeia a string de tipo (vinda do banco) para a Strategy correspondente. É o mecanismo de despacho que torna o Strategy utilizável — sem ele, o `Monitor` precisaria de um `switch` para instanciar a estratégia certa, o que anularia o propósito do padrão.

---

## 4. Refatorações aplicadas

### 4.1. PR — Conclusão da migração Strategy para o tipo `ping`

**Smells atacados:** 2.1 (God Class), 2.2.1 e 2.2.2 (Switch Statements)

**O que foi feito:**

**(a) Extensão do contrato `MonitorType`** — adicionamos um método `validate()` com implementação padrão vazia:

```js
/**
 * Validate the monitor configuration for this type.
 * The default implementation performs no type-specific validation, so
 * existing monitor types are unaffected (Open/Closed Principle).
 */
validate(monitor) {
    // No type-specific validation by default.
}
```

**Retrocompatível por construção:** as 24 implementações existentes herdam o no-op e **não foram tocadas**. Isso é o **Princípio Aberto/Fechado na prática** — estendemos o comportamento do sistema sem modificar código existente.

**(b) Criação de `server/monitor-types/ping.js`** — classe `PingMonitorType` com `check()` (execução, extraída do beat) e `validate()` (as quatro regras, extraídas do `validate()` do `monitor.js`).

**(c) Delegação genérica no `monitor.js`** — o bloco `if (this.type === "ping") { ... }` do `validate()` foi substituído por:

```js
// Delegate type-specific validation to the monitor type (Strategy),
// instead of hard-coding each type in this method.
const monitorType = UptimeKumaServer.monitorTypeList[this.type];
if (monitorType) {
    monitorType.validate(this);
}
```

Isso não resolve apenas o `ping`: **cria o mecanismo que elimina a categoria inteira do problema.** Qualquer tipo futuro pode declarar suas próprias regras sem tocar na God Class.

**Impacto mensurável:**

```
server/model/monitor.js              | 69 +++-------------------
server/monitor-types/monitor-type.js | 15 ++++++++
server/monitor-types/ping.js         | (novo)
server/uptime-kuma-server.js         |  4 ++-
```

O `monitor.js` perdeu **61 linhas líquidas**. E, como **evidência mecânica de que a responsabilidade migrou**, o ESLint apontou **13 símbolos órfãos** — a função `ping` e as 12 constantes `PING_*` —, todos removidos dos imports. **O arquivo não precisa mais de nenhum conceito relacionado a ping.**

**Validação:**
- Execução: `Monitor #1 'Ping Google': Successful Response: 13 ms | Type: ping`
- Validação delegada: `Timeout must be between 1 and 300 seconds (default: 10)` — mensagem originada no `throw` dentro de `PingMonitorType.validate()`
- Lint: 0 erros
- Testes de backend: 179 passam; as 35 falhas são de Testcontainers (ausência de Docker no ambiente), não regressão

---

### 4.2. PR — Correção do estado de domínio não modelado

**Smell atacado:** 2.4 (Assertion abuse)

**O que foi feito:**

**(a) Correção na escrita** — não persistir data inválida:

```js
if (expiryDate === null) {
    // The RDAP server for this TLD responds, but does not provide an expiry
    // date (e.g. .no). Persist the check timestamp so the cache still works,
    // but keep `expiry` NULL rather than storing an invalid date.
    bean.expiry = null;
    bean.lastCheck = R.isoDateTimeMillis(dayjs.utc());
    await R.store(bean);
    return;
}
```

**(b) Correção na leitura** — validar o cache antes de devolver:

```js
// The cached value may be invalid for domains whose RDAP server does not
// publish an expiry date. Honour the documented contract and return
// undefined instead of a truthy but unusable value.
if (!bean.expiry || isNaN(new Date(bean.expiry).getTime())) {
    return;
}
return bean.expiry;
```

**Justificativa da dupla correção:** (a) ataca a causa raiz; (b) é defesa em profundidade e **cura instalações cujo banco já contém dados corrompidos**. Sem (b), usuários existentes continuariam vendo o bug após atualizar.

**Por que a correção óbvia não bastaria:** o relator da issue tentou remover o `log.warn`. O aviso some, mas — nas palavras dele — *"it still triggers a sendNotification each min"*. Remover o log silencia o **detector**, não a **fonte**.

**Validação:**

| Domínio | Antes | Depois |
|---|---|---|
| `vg.no` (RDAP sem data) | `WARN: No valid expiry date...` a cada 60s | `DEBUG: Failed getting expiration date` — silencioso e correto |
| `example.com` (RDAP com data) | funcionava | continua: `example.com expires in 29 days` + os 3 limiares avaliados |

---

## 5. Trabalho futuro

Escopo é uma decisão de engenharia, não uma omissão. Registramos abaixo o que **identificamos e conscientemente não fizemos**, com o motivo.

| Item | Por que não foi feito agora |
|---|---|
| **Migrar `real-browser` e `mongodb` para o novo `validate()`** | São os próximos candidatos óbvios — e agora **sem custo arquitetural**, pois o mecanismo já existe. Não incluídos para manter o PR focado e revisável. |
| **Migrar `http`/`keyword`/`json-query`** | Os três são **entrelaçados**: compartilham a montagem da requisição Axios (~250 linhas) e a lógica de retry por status code, incluindo a cláusula degenerada `this.type === "json-query" && this.retry_only_on_status_code_failure`. Exigem extração conjunta e um redesenho da hierarquia (provavelmente uma `HttpMonitorType` base com subclasses). |
| **Migrar `push`** | Depende da lógica de janela de heartbeat e do `previousBeat`, que estão acoplados ao loop do `beat()` e ao agendamento. Migrá-lo exigiria primeiro extrair o agendamento da God Class. |
| **Separar `validate()` de `normalize()`** | Corrigiria o smell 2.3, mas **alteraria o comportamento observável** do sistema — o que está fora da definição de refatoração. |
| **Extrair `MonitorScheduler` e `MonitorNotifier`** | Atacaria o smell 2.1 de frente, mas é uma mudança de grande porte, incompatível com o escopo e o prazo deste trabalho. |
| **Resolver a dependência circular (2.5)** | Exigiria injeção de dependência ou um módulo de registro, com impacto em todos os 24 tipos. |

**Limitação conhecida da refatoração 4.2:** a correção sincroniza a validação entre os dois caminhos de retorno do `checkExpiry()`, mas **não elimina a duplicação da regra** — a validação de data ainda aparece em dois pontos do método. Foi precisamente essa duplicação que originou o bug (um ramo tinha a guarda, o outro não). Uma refatoração posterior poderia extrair a validação para um único ponto de saída, tornando a omissão estruturalmente impossível.
