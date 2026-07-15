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

A suíte possui três testes de aceitação:

1. Criação de um monitor HTTP.
2. Pausa e retomada de um monitor existente.
3. Exclusão de um monitor.

Na execução final, os três testes foram concluídos com sucesso, sem falhas.

### Limitações

Os testes dependem de uma instância local da aplicação em execução e de um usuário administrador previamente configurado. Os cenários de criação e pausa podem deixar monitores cadastrados no banco de desenvolvimento, pois cada teste utiliza um nome único para preservar sua independência.

## DevOps

A configuração e a análise da integração contínua serão documentadas nesta seção.