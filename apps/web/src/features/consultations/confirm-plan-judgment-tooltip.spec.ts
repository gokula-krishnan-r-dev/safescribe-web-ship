import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONFIRM_PLAN_TOOLTIP_OPEN_DELAY_MS,
  CONFIRM_PLAN_TOOLTIP_VISIBLE_MS,
  CONFIRM_TREATMENT_PLAN_HELPER,
  CONFIRM_TREATMENT_PLAN_JUDGMENT,
  createJudgmentTooltipMachine,
  placeJudgmentTooltip,
} from './confirm-plan-judgment';

class FakeClock {
  now = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();

  schedule = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + ms, fn });
    return id;
  };

  cancel = (handle: unknown) => {
    this.tasks.delete(handle as number);
  };

  tick(ms: number) {
    this.now += ms;
    const due = [...this.tasks.entries()]
      .filter(([, task]) => task.at <= this.now)
      .sort((a, b) => a[1].at - b[1].at);
    for (const [id, task] of due) {
      this.tasks.delete(id);
      task.fn();
    }
  }
}

function machine() {
  const clock = new FakeClock();
  let open = false;
  const ctl = createJudgmentTooltipMachine({
    onOpenChange: (next) => {
      open = next;
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { clock, ctl, isOpen: () => open };
}

describe('confirm treatment plan judgment tooltip', () => {
  it('uses helper copy without a professional-judgment attestation', () => {
    assert.equal(CONFIRM_TREATMENT_PLAN_JUDGMENT, '');
    assert.equal(
      CONFIRM_TREATMENT_PLAN_HELPER,
      'Confirm to generate or refresh counselling and follow-up.',
    );
    assert.equal(CONFIRM_PLAN_TOOLTIP_OPEN_DELAY_MS, 300);
    assert.equal(CONFIRM_PLAN_TOOLTIP_VISIBLE_MS, 5000);
  });

  it('is absent on initial render', () => {
    const { ctl, isOpen } = machine();
    assert.equal(ctl.getPhase(), 'idle');
    assert.equal(isOpen(), false);
  });

  it('does not open if the pointer leaves before 300 ms', () => {
    const { clock, ctl, isOpen } = machine();
    ctl.enter();
    clock.tick(299);
    assert.equal(isOpen(), false);
    ctl.leave();
    clock.tick(50);
    assert.equal(isOpen(), false);
    assert.equal(ctl.getPhase(), 'idle');
  });

  it('opens after 300 ms with a new hover cycle', () => {
    const { clock, ctl, isOpen } = machine();
    ctl.enter();
    clock.tick(300);
    assert.equal(isOpen(), true);
    assert.equal(ctl.getPhase(), 'visible');
  });

  it('hides immediately on leave, blur, escape, or click', () => {
    const { clock, ctl, isOpen } = machine();
    ctl.enter();
    clock.tick(300);
    ctl.leave();
    assert.equal(isOpen(), false);

    ctl.enter();
    clock.tick(300);
    ctl.dismiss();
    assert.equal(isOpen(), false);
  });

  it('auto-hides after 5 seconds and does not reopen until leave then enter', () => {
    const { clock, ctl, isOpen } = machine();
    ctl.enter();
    clock.tick(300);
    assert.equal(isOpen(), true);
    clock.tick(5000);
    assert.equal(isOpen(), false);
    assert.equal(ctl.getPhase(), 'suppressed');

    ctl.enter();
    clock.tick(300);
    assert.equal(isOpen(), false);

    ctl.leave();
    ctl.enter();
    clock.tick(300);
    assert.equal(isOpen(), true);
  });

  it('does not stack extra instances while already visible', () => {
    const { clock, ctl, isOpen } = machine();
    ctl.enter();
    clock.tick(300);
    ctl.enter();
    clock.tick(5000);
    assert.equal(isOpen(), false);
    assert.equal(ctl.getPhase(), 'suppressed');
  });
});

describe('placeJudgmentTooltip', () => {
  it('centres above the button when there is room', () => {
    const placed = placeJudgmentTooltip({
      anchor: { top: 200, left: 400, width: 220, height: 44 },
      tooltip: { width: 400, height: 56 },
      viewport: { width: 1200, height: 800 },
    });
    assert.equal(placed.side, 'top');
    assert.equal(placed.left, 400 + 110 - 200);
    assert.ok(placed.top < 200);
  });

  it('flips below when the viewport has no room above', () => {
    const placed = placeJudgmentTooltip({
      anchor: { top: 20, left: 40, width: 220, height: 44 },
      tooltip: { width: 400, height: 56 },
      viewport: { width: 480, height: 400 },
    });
    assert.equal(placed.side, 'bottom');
    assert.ok(placed.left >= 8);
    assert.ok(placed.left + 400 <= 480 - 8);
  });
});
