import { defineConfig } from "cypress";

export default defineConfig({
    allowCypressEnv: false,
    e2e: {
        baseUrl: "http://localhost:3000",
        defaultCommandTimeout: 10000,
        supportFile: "cypress/support/e2e.ts",
        specPattern: "cypress/e2e/**/*.cy.ts",
    },
});