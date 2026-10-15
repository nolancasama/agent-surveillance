import test from 'node:test';
import assert from 'node:assert/strict';
import { Evaluate } from './evaluate.js';

const heard = transcript => ({ transcript, confidence: 0.95, gotResult: true });

test('deduction accepts the correct LIKES sentence', () => {
  const result = Evaluate.evaluateClip({ fact: 'flowers', frame: 'She likes ______.' }, heard('She likes flowers.'));
  assert.equal(result.verification, 'confirmed');
});

test('deduction rejects a wrong LIKES fact', () => {
  const result = Evaluate.evaluateClip({ fact: 'flowers', frame: 'She likes ______.' }, heard('She likes robots.'));
  assert.equal(result.verification, 'mismatch');
});

test('deduction accepts the correct CAN sentence', () => {
  const result = Evaluate.evaluateClip({ fact: 'ride a bike', frame: 'She can ______.' }, heard('She can ride a bike.'));
  assert.equal(result.verification, 'confirmed');
});

test('deduction rejects a wrong CAN fact', () => {
  const result = Evaluate.evaluateClip({ fact: 'ride a bike', frame: 'She can ______.' }, heard('She can swim.'));
  assert.equal(result.verification, 'mismatch');
});

