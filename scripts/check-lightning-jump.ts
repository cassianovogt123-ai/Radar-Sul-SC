// Self-check da regra do salto de raios: npx tsx scripts/check-lightning-jump.ts
import assert from 'node:assert';
import { isJump } from '../src/utils/lightningJumpRule';

assert.equal(isJump([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).jump, false, 'sem raios');
assert.equal(isJump([20, 22, 19, 21, 20, 23, 22, 20, 21, 19, 22, 21]).jump, false, 'tempestade estável');
assert.equal(isJump([2, 3, 2, 4, 3, 2, 3, 4, 3, 2, 30, 45]).jump, true, 'salto brusco');
assert.equal(isJump([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 5]).jump, false, 'pouco raio é ruído');
assert.equal(isJump([1, 2, 3]).jump, false, 'poucos minutos de dado');
console.log('OK: regra do salto de raios');
