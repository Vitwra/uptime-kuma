function createHttpMonitor(name: string) {
    cy.contains("a", "Adicionar novo monitor").click();
    cy.get('[data-testid="friendly-name-input"]').type(name);
    cy.get('[data-testid="url-input"]')
        .clear()
        .type("https://example.com");
    cy.get('[data-testid="save-button"]').click();

    cy.contains("h1", name, { timeout: 15000 })
        .should("be.visible");
}

describe("Gerenciamento de monitores", () => {
    beforeEach(() => {
        cy.login();
    });

    it("cria um monitor HTTP e o exibe no painel", () => {
        const monitorName = `Monitor Cypress Criacao ${Date.now()}`;

        createHttpMonitor(monitorName);
    });

    it("pausa e retoma um monitor existente", () => {
        const monitorName = `Monitor Cypress Pausa ${Date.now()}`;

        createHttpMonitor(monitorName);

        cy.contains("button", "Pausar").click();

        cy.contains("button", "Retomar", { timeout: 15000 })
            .should("be.visible");

        cy.contains("button", "Retomar").click();
        cy.contains("button", "Pausar", { timeout: 15000 })
            .should("be.visible");
    });

    it("exclui um monitor e ele desaparece do painel", () => {
        const monitorName = `Monitor Cypress Exclusao ${Date.now()}`;

        createHttpMonitor(monitorName);

        cy.contains("button", "Apagar").click();
        cy.get(".modal.show")
            .contains("button", "Sim")
            .click();

        cy.get(".modal.show").should("not.exist");

        cy.get('[data-testid="monitor-list"]', { timeout: 15000 })
            .should("not.contain.text", monitorName);
    });
});