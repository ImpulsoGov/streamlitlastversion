/**
 * @license
 * Copyright 2018-2020 Streamlit Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/// <reference types="cypress" />

describe("st.table", () => {
  beforeEach(() => {
    cy.visit("http://localhost:3000/");

    cy.get(".element-container .stTable tbody tr").as("rows");
    cy.get(".element-container .stTable tbody td").as("cells");
  });

  it("displays a table", () => {
    cy.get(".element-container").find(".stTable");
  });

  it("checks number of rows", () => {
    cy.get("@rows")
      .its("length")
      .should("eq", 10);
  });

  it("checks number of cells", () => {
    cy.get("@cells")
      .its("length")
      .should("eq", 100);
  });

  it("contains all numbers from 0..99", () => {
    cy.get("@cells").each(($element, index) => {
      return cy.wrap($element).should("contain", index);
    });
  });

  it("looks the same", () => {
    // (HK) TODO: diff screenshots
  });
});
