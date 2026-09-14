import assert from "node:assert/strict";
import test from "node:test";
import { repositoryMatchesCompany } from "./github-repository-matching.ts";

const company = {
  companyName: "Public Brand",
  website: "https://publicbrand.example",
};

test("uses verified repository mappings as exact matches", () => {
  assert.equal(repositoryMatchesCompany("internal/build-engine", company, ["internal/build-engine"]), true);
  assert.equal(repositoryMatchesCompany("Internal/Build-Engine", company, ["internal/build-engine"]), true);
});

test("does not fall back to brand heuristics when verified mappings exist", () => {
  assert.equal(repositoryMatchesCompany("publicbrand/website", company, ["internal/build-engine"]), false);
});

test("uses public brand heuristics when no verified mapping exists", () => {
  assert.equal(repositoryMatchesCompany("publicbrand/platform", company, []), true);
});