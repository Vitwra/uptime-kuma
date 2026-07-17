# Testes e DevOps

## Testes de aceitação

### Objetivo

Os testes de aceitação verificam as principais operações de gerenciamento de monitores do Uptime Kuma pela perspectiva do usuário. Eles executam o sistema em um navegador real, preenchendo formulários e acionando os mesmos elementos utilizados durante o uso normal da aplicação.

### Cenários de aceitação

```gherkin
Funcionalidade: Gerenciamento de monitores

  Cenário: Criar um monitor HTTP
    Dado que o administrador está autenticado
    Quando cria um monitor HTTP para https://example.com
    Então o monitor deve ser salvo e exibido no painel

  Cenário: Pausar e retomar um monitor
    Dado que existe um monitor HTTP cadastrado
    Quando o administrador pausa o monitor
    Então a opção de retomar deve ser exibida
    Quando o administrador retoma o monitor
    Então a opção de pausar deve ser exibida novamente

  Cenário: Excluir um monitor
    Dado que existe um monitor HTTP cadastrado
    Quando o administrador confirma a exclusão
    Então o monitor não deve mais aparecer na lista do painel
```

### Cobertura e riscos

Os testes cobrem três operações essenciais do sistema:

- Criação e persistência de um monitor HTTP.
- Alteração do estado do monitor por meio de pausa e retomada.
- Exclusão do monitor e atualização da lista do painel.

Esses testes reduzem o risco de regressões nos fluxos principais de gerenciamento de monitores, incluindo problemas de navegação, formulários, modais de confirmação e atualização da interface.

### Estratégia adotada

Foi utilizado o Cypress para implementar testes automatizados de ponta a ponta (E2E). Cada teste realiza autenticação, cria seus próprios dados e utiliza um nome único baseado na data e hora da execução.

Essa estratégia evita dependência entre os cenários e permite executar cada teste isoladamente. Os testes utilizam seletores `data-testid` quando disponíveis e verificações baseadas em elementos visíveis da interface.

### Justificativa da ferramenta

O Cypress foi escolhido porque permite:

- Simular as ações realizadas por um usuário no navegador.
- Aguardar automaticamente os elementos da interface.
- Exibir detalhadamente cada comando e cada verificação.
- Executar os testes de forma interativa ou sem interface gráfica.
- Produzir um resultado adequado para uso futuro em integração contínua.

O projeto já possui testes automatizados com Playwright. O Cypress foi adicionado especificamente para os testes de aceitação solicitados neste trabalho.

### Pré-requisitos

- Node.js e npm instalados.
- Dependências do projeto instaladas.
- Aplicação configurada com um usuário administrador.
- Usuário utilizado no ambiente local: `admin`.
- Senha utilizada no ambiente local: `admin123`.

### Execução

Instale as dependências:

```bash
npm install
```

Inicie a aplicação:

```bash
npm run dev
```

Em outro terminal, execute os testes de aceitação:

```bash
npx cypress run --spec "cypress/e2e/monitor.cy.ts"
```

Para acompanhar os testes pelo navegador:

```bash
npx cypress open
```


### Resultados

A suíte possui três testes de aceitação automatizados:

1. Criação de um monitor HTTP.
2. Pausa e retomada de um monitor existente.
3. Exclusão de um monitor.

Os três cenários foram executados com sucesso em modo headless, utilizando o comando:

```bash
npx cypress run --spec "cypress/e2e/monitor.cy.ts"
```

Resultado da execução:

```text
√ cria um monitor HTTP e o exibe no painel
√ pausa e retoma um monitor existente
√ exclui um monitor e ele desaparece do painel

3 passing
0 failing
0 pending
0 skipped
```

A execução demonstrou que os três fluxos funcionam corretamente no ambiente automatizado do Cypress. Os testes exercitam operações realizadas pelo usuário, incluindo autenticação, preenchimento de formulário, criação de dados, interação com modais de confirmação e atualização da interface.

### Limitações

Os testes dependem de uma instância local do Uptime Kuma em execução e de um usuário administrador previamente configurado.

Cada teste cria seus próprios dados utilizando nomes únicos baseados na data e hora da execução. Essa estratégia garante independência entre os cenários e permite que cada teste seja executado isoladamente. Entretanto, os testes de criação e de pausa e retomada podem deixar monitores residuais no banco de dados utilizado no ambiente de desenvolvimento.

O tempo total de execução pode variar de acordo com o desempenho da máquina, o carregamento da aplicação e o tempo de resposta do endereço utilizado no monitor HTTP.

## DevOps

### Análise do pipeline existente

O projeto utiliza GitHub Actions para automatizar verificações executadas a cada push e pull request. O principal workflow, localizado em `.github/workflows/auto-test.yml`, possui os seguintes jobs:

- `auto-test`: realiza o build e executa os testes de backend em diferentes sistemas operacionais e versões do Node.js;
- `check-linters`: executa as verificações de qualidade de código com o ESLint;
- `e2e-test`: executa os testes de ponta a ponta já existentes no projeto com Playwright;
- `armv7-simple-test`: verifica a instalação das dependências de produção em uma arquitetura ARMv7 utilizando Docker e QEMU.

### Problema identificado

O pipeline possuía uma configuração de cache do diretório `node_modules`, mas ela estava desabilitada devido a preocupações relacionadas à segurança da cadeia de dependências.

Sem um mecanismo alternativo de cache, os jobs precisavam baixar novamente todas as dependências a cada execução. Como o workflow utiliza diversas combinações de sistemas operacionais e versões do Node.js, isso aumenta o tempo de execução e o consumo de minutos dos runners.

A configuração antiga não foi simplesmente reativada porque armazenava a árvore de dependências já instalada, incluindo scripts de instalação que poderiam permanecer no cache em caso de comprometimento de algum pacote.

### Melhoria implementada

Foi habilitado o cache nativo do npm por meio da action `actions/setup-node`:

```yaml
with:
  node-version: ${{ matrix.node }}
  cache: npm
```

A melhoria foi aplicada aos jobs `auto-test`, `check-linters` e `e2e-test`, que realizam a instalação das dependências.

Diferentemente do cache direto de `node_modules`, o cache nativo do `setup-node` armazena os pacotes baixados pelo npm. O comando `npm clean-install` continua sendo executado normalmente, instalando as dependências do zero e validando sua integridade de acordo com o arquivo `package-lock.json`.

O job `armv7-simple-test` não foi alterado, pois a instalação ocorre dentro de um contêiner ARM executado por meio do QEMU e não utiliza a action `setup-node`.

### Benefícios da melhoria

A alteração proporciona os seguintes benefícios:

- redução do tempo gasto com o download das dependências;
- reaproveitamento seguro do cache entre as execuções;
- menor consumo de minutos dos runners do GitHub Actions;
- manutenção das verificações de integridade realizadas pelo npm;
- nenhuma alteração no comportamento do build ou dos testes.

A solução melhora o desempenho do pipeline sem reativar o cache de `node_modules` que havia sido desabilitado pelos mantenedores por razões de segurança.
