/// <reference types="cypress" />

declare global {
    namespace Cypress {
        interface Chainable {
            login(): Chainable<void>;
        }
    }
}

Cypress.Commands.add("login", () => {
    cy.visit("/#/login");
    cy.get("#floatingInput").clear().type("admin");
    cy.get("#floatingPassword").type("admin123");
    cy.get('form[aria-label="Login Form"]').submit();

    cy.contains("Adicionar novo monitor", { timeout: 15000 })
        .should("be.visible");
});

export {};