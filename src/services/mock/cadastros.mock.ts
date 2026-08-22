import { registerMock } from "./mock-transport";
import { clonar, db } from "./db";

/** Mocks básicos de leitura para módulos ainda não implementados nesta etapa. */
export function registerCadastrosMocks(): void {
  registerMock("GET", "/clientes", () => ({
    data: clonar(db.clientes),
    meta: { total: db.clientes.length },
  }));
  registerMock("GET", "/fornecedores", () => ({
    data: clonar(db.fornecedores),
    meta: { total: db.fornecedores.length },
  }));
  registerMock("GET", "/colecoes", () => ({
    data: clonar(db.colecoes),
    meta: { total: db.colecoes.length },
  }));
  registerMock("GET", "/campanhas", () => ({
    data: clonar(db.campanhas),
    meta: { total: db.campanhas.length },
  }));
}
