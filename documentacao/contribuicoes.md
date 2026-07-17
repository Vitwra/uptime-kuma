# Contribuições

> **CSI410 – Engenharia de Software II** — UFOP / ICEA / DECSI
> Professor: Igor Muzetti Pereira — Semestre 2026/1
> Trabalho prático: *Open Source engineering challenge*
>
> **Projeto:** [Uptime Kuma](https://github.com/louislam/uptime-kuma) v2.4.0
> **Fork:** https://github.com/Vitwra/uptime-kuma
> **Dupla:** Vitor Angelo dos Santos e Eduarda Camilo

---

## 1. Projeto escolhido

O **Uptime Kuma** é uma ferramenta *self-hosted* de monitoramento de disponibilidade (*uptime monitoring*), com frontend em Vue 3, backend em Node.js (Express + Socket.IO) e persistência em SQLite via Knex. É um projeto maduro (mais de 2000 linhas apenas no núcleo do domínio, centenas de issues e PRs em aberto), o que o torna adequado para um exercício de engenharia de software real: os *code smells* são genuínos e as decisões arquiteturais têm consequências observáveis.

A análise foi feita sobre o commit `62a2d01d3f2eb6df47e1c987b7819bead6a91e2e` (versão 2.4.0).

---

## 2. Caminho A — Issue resolvida

**Issue:** [louislam/uptime-kuma#7452 — RDAP endpoints without expire info](https://github.com/louislam/uptime-kuma/issues/7452)
**Pull Request:** [#2 — fix(domain-expiry)](https://github.com/Vitwra/uptime-kuma/pull/2)

### Descrição do problema

Monitores com a notificação de expiração de domínio habilitada, em domínios cujo servidor RDAP responde mas **não publica data de expiração** (como o `.no`, via `rdap.norid.no`), emitiam o seguinte aviso **a cada heartbeat** (60 segundos), indefinidamente:

```
[DOMAIN_EXPIRY] WARN: No valid expiry date passed to sendNotifications for vg.no (expiry: Invalid Date), skipping notification
```

### Diagnóstico da causa raiz

O aviso era uma **asserção defensiva** — o próprio código a comentava como *"Should not happen and likely indicates a bug in the code"*. A asserção estava correta: havia um bug.

Em `DomainExpiry.checkExpiry()`:

1. `getExpiryDate()` retorna `null` quando o RDAP não traz a data.
2. O código persistia esse `null` via `R.isoDateTimeMillis(null)`, que produz a **string `"Invalid Date"`** — não `null`, não `undefined`.
3. A guarda `if (expiryDate === null) return;` existia, mas rodava **depois** de `R.store(bean)` — o banco já havia sido contaminado.
4. Nas 24h seguintes, o ramo de **cache** do método devolvia esse valor sem validar (`return bean.expiry`).
5. Uma string não-vazia é **truthy** em JavaScript, então a guarda do chamador era **derrotada por coerção de tipo**, e `sendNotifications()` era invocado com dado inválido.

O diagnóstico foi comprovado em tempo de execução, com instrumentação temporária:

```
[DOMAIN_EXPIRY] DEBUG: valor=Invalid Date | tipo=string | truthy=true
```

### Solução

A correção foi aplicada em duas camadas:

- **Escrita:** não persistir data inválida — gravar `NULL` quando o RDAP não fornece a data (estado que a própria migration do banco já previa, com a coluna `expiry` nullable).
- **Leitura:** validar o valor cacheado antes de devolvê-lo, honrando o contrato declarado no JSDoc (`Promise<Date | undefined>`). Isso também cura instalações cujo banco já contém dados corrompidos.

A correção "óbvia" (remover o `log.warn`, como tentado no PR concorrente do upstream) não resolveria o problema: silenciaria o detector, mas o `sendNotifications` continuaria sendo chamado a cada minuto.

### Validação

| Domínio | Antes | Depois |
|---|---|---|
| `vg.no` (RDAP sem data) | `WARN` a cada 60s | `DEBUG: Failed getting expiration date` — correto e silencioso |
| `example.com` (RDAP com data) | funcionava | continua: `example.com expires in 29 days` + 3 limiares avaliados |

### Nota de transparência

Ao selecionar esta issue, identificamos que já existia um pull request aberto no repositório original (#7456). Optamos por mantê-la porque o enunciado exige resolver um problema real do projeto **no nosso fork**, e não a aceitação *upstream* (que é bônus). **Deliberadamente não consultamos o #7456** antes de produzir a solução, para que o diagnóstico e a implementação fossem integralmente autorais.

---

## 3. Caminho B — Refatoração

**Pull Request:** [#3 — refactor(monitor): migra o tipo ping para o padrão Strategy](https://github.com/Vitwra/uptime-kuma/pull/3)

### Diagnóstico

O projeto adotou o padrão **Strategy** para os tipos de monitor: a interface `MonitorType` (`server/monitor-types/monitor-type.js`) define o contrato, e 24 implementações concretas o especializam. Porém, essa migração **nunca foi concluída**: os oito tipos mais utilizados do produto (`http`, `keyword`, `json-query`, `ping`, `push`, `docker`, `radius`, `kafka-producer`) permaneciam em uma cadeia condicional de aproximadamente 500 linhas dentro de `server/model/monitor.js` (2069 linhas — uma *God Class*).

Os dois mecanismos coexistiam no mesmo `if/else if`: a Strategy foi introduzida apenas como o penúltimo ramo do condicional, em vez de eliminá-lo.

### O que foi feito

Concluímos a migração para o tipo `ping` — o mais autocontido dos oito — em execução **e** validação:

1. **Extensão do contrato `MonitorType`:** adição de um método `validate()` com implementação padrão vazia. Retrocompatível por construção — as 24 implementações existentes herdam o *no-op* e não foram tocadas (Princípio Aberto/Fechado).
2. **Criação de `PingMonitorType`** (`server/monitor-types/ping.js`), com `check()` (execução) e `validate()` (as quatro regras de validação), extraídos do `monitor.js`.
3. **Delegação genérica** no `monitor.js`: o bloco condicional do `ping` no método `validate()` foi substituído por uma chamada genérica `monitorType.validate(this)`, que cria o mecanismo para eliminar a categoria inteira do problema — qualquer tipo futuro pode validar suas próprias regras sem tocar na *God Class*.

### Impacto mensurável

O `monitor.js` perdeu **61 linhas líquidas**, e o ESLint identificou **13 símbolos órfãos** (a função `ping` e as 12 constantes `PING_*`), todos removidos dos imports — evidência de que a responsabilidade migrou por completo.

### Validação

- **Execução:** `Monitor #1 'Ping Google': Successful Response: 13 ms | Type: ping`
- **Validação delegada:** `Timeout must be between 1 and 300 seconds` — mensagem originada no `validate()` da nova Strategy
- **Lint:** 0 erros
- **Testes de backend:** 179 passam; as 35 falhas são de testes que dependem de Docker/Testcontainers (ausente no ambiente), não regressão

---

## 4. Lista de Pull Requests

| PR | Título | Conteúdo | Autor |
|---|---|---|---|
| [#1](https://github.com/Vitwra/uptime-kuma/pull/1) | docs: análise da arquitetura do sistema | `arquitetura.md` + 2 diagramas Mermaid | Vitor |
| [#2](https://github.com/Vitwra/uptime-kuma/pull/2) | fix(domain-expiry) | Caminho A — correção da issue #7452 | Vitor |
| [#3](https://github.com/Vitwra/uptime-kuma/pull/3) | refactor(monitor): ping → Strategy | Caminho B — refatoração + contrato estendido | Vitor |
| [#4](https://github.com/Vitwra/uptime-kuma/pull/4) | docs: padrões, code smells e refatorações | `padroes_e_smells.md` — 6 smells, 5 padrões | Vitor |
| [#5](https://github.com/Vitwra/uptime-kuma/pull/5) | ci: cache do npm no setup-node | DevOps — melhoria de pipeline | Vitor |
| [#6](https://github.com/Vitwra/uptime-kuma/pull/6) | test: testes de aceitação E2E com Cypress | 3 testes de aceitação | Eduarda |

Todos os PRs foram revisados pelo outro integrante antes do *merge* (revisão entre membros), e todos passaram na integração contínua do projeto (à exceção do workflow `autofix.ci`, que depende de um GitHub App instalado apenas no repositório original e, portanto, falha em qualquer fork — uma limitação de portabilidade documentada em `testes_devops.md`).

---

## 5. Papel de cada integrante

**Vitor Angelo dos Santos**
- Documentação da arquitetura (PR #1)
- Resolução da issue do Caminho A, incluindo o diagnóstico por instrumentação (PR #2)
- Refatoração do Caminho B — migração do `ping` para Strategy e extensão do contrato (PR #3)
- Análise de padrões e *code smells* (PR #4)
- Melhoria de DevOps/CI (PR #5)
- Revisão do PR de testes (#6)

**Eduarda Camilo**
- Implementação da suíte de testes de aceitação com Cypress (PR #6): configuração, comando de login reutilizável, três cenários (criação, pausa/retomada e exclusão de monitores) e documentação da estratégia
- Revisão dos PRs de código e documentação (#2 a #5)

**Trabalho conjunto:** durante a revisão do PR #6, os dois integrantes trabalharam juntos para diagnosticar e resolver uma incompatibilidade entre o modal de confirmação (Bootstrap 5) e o modo *headless* do Cypress. A funcionalidade de pausa/retomada foi validada, o teste correspondente foi documentado e mantido no código, e a limitação foi registrada com sua análise técnica em `testes_devops.md`.

---

## 6. Nota sobre o uso de IA

Em conformidade com as boas práticas de transparência acadêmica, declaramos o uso de assistência de IA no desenvolvimento deste trabalho, empregada para: navegação e leitura do código-fonte, formulação de hipóteses de diagnóstico, revisão de texto e sugestões de implementação.

Todos os diagnósticos foram **validados empiricamente** (reprodução dos bugs, instrumentação do código, execução dos testes e leitura do histórico de *migrations*). Todas as decisões técnicas foram compreendidas pelos autores e são por eles defensáveis — incluindo as decisões conscientes de escopo (o que foi deliberadamente deixado como trabalho futuro, com sua justificativa, está registrado em `padroes_e_smells.md`).
