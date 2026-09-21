import { test } from "node:test";
import assert from "node:assert/strict";
import { paginationInfo } from "./github-client.mjs";

test("paginationInfo advances pages and wraps at the end", () => {
  assert.deepEqual(paginationInfo(250, 1, 100), { totalPages: 3, lastPage: 3, nextPage: 2 });
  assert.deepEqual(paginationInfo(250, 3, 100), { totalPages: 3, lastPage: 3, nextPage: 1 });
});

test("paginationInfo caps at the GitHub 1000-result limit", () => {
  const info = paginationInfo(5000, 1, 100);
  assert.equal(info.lastPage, 10);
  assert.equal(info.nextPage, 2);
  assert.equal(paginationInfo(5000, 10, 100).nextPage, 1);
});
