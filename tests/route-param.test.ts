import type { Request } from 'express';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeParam } from '../server/routeParam';

test('named route parameters preserve strings and reject missing or wildcard values', () => {
  assert.equal(routeParam({ params: { id: 'invoice-123' } }, 'id'), 'invoice-123');
  for (const params of [{}, { id: ['invoice-123', 'other'] }] as Request['params'][]) {
    assert.throws(() => routeParam({ params }, 'id'), { status: 400 });
  }
});
