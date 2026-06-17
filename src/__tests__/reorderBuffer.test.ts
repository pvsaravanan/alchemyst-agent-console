import { ReorderBuffer } from "../utils/reorderBuffer";

describe("ReorderBuffer", () => {
  let reorderBuffer: ReorderBuffer;

  beforeEach(() => {
    reorderBuffer = new ReorderBuffer(0);
  });

  test("should process sequential messages in order immediately", () => {
    const msg1 = { seq: 1, text: "A" };
    const msg2 = { seq: 2, text: "B" };
    const msg3 = { seq: 3, text: "C" };

    expect(reorderBuffer.addMessage(msg1)).toEqual([msg1]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(1);

    expect(reorderBuffer.addMessage(msg2)).toEqual([msg2]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(2);

    expect(reorderBuffer.addMessage(msg3)).toEqual([msg3]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(3);
  });

  test("should buffer out-of-order messages and release when gap is filled", () => {
    const msg1 = { seq: 1, text: "A" };
    const msg2 = { seq: 2, text: "B" };
    const msg3 = { seq: 3, text: "C" };
    const msg4 = { seq: 4, text: "D" };

    // Send 3 first
    expect(reorderBuffer.addMessage(msg3)).toEqual([]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(0);
    expect(reorderBuffer.getBuffer()).toEqual([msg3]);

    // Send 2
    expect(reorderBuffer.addMessage(msg2)).toEqual([]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(0);
    expect(reorderBuffer.getBuffer()).toEqual([msg2, msg3]);

    // Send 4
    expect(reorderBuffer.addMessage(msg4)).toEqual([]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(0);
    expect(reorderBuffer.getBuffer()).toEqual([msg2, msg3, msg4]);

    // Send 1 (fills the gap!) - should release 1, 2, 3, 4
    expect(reorderBuffer.addMessage(msg1)).toEqual([msg1, msg2, msg3, msg4]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(4);
    expect(reorderBuffer.getBuffer()).toEqual([]);
  });

  test("should filter out duplicate messages", () => {
    const msg1 = { seq: 1, text: "A" };
    const msg2 = { seq: 2, text: "B" };

    expect(reorderBuffer.addMessage(msg1)).toEqual([msg1]);
    // Send duplicate msg1
    expect(reorderBuffer.addMessage(msg1)).toEqual([]);

    expect(reorderBuffer.addMessage(msg2)).toEqual([msg2]);
    // Send duplicate msg2
    expect(reorderBuffer.addMessage(msg2)).toEqual([]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(2);
  });

  test("should filter out late duplicates already processed", () => {
    const msg1 = { seq: 1, text: "A" };
    const msg2 = { seq: 2, text: "B" };
    const msg3 = { seq: 3, text: "C" };

    expect(reorderBuffer.addMessage(msg1)).toEqual([msg1]);
    expect(reorderBuffer.addMessage(msg3)).toEqual([]); // buffered

    expect(reorderBuffer.addMessage(msg2)).toEqual([msg2, msg3]); // releases both
    expect(reorderBuffer.getLastProcessedSeq()).toBe(3);

    // Send duplicate of 2
    expect(reorderBuffer.addMessage(msg2)).toEqual([]);
    expect(reorderBuffer.getLastProcessedSeq()).toBe(3);
  });

  test("should handle reset state correctly", () => {
    const msg1 = { seq: 1, text: "A" };
    const msg2 = { seq: 2, text: "B" };

    reorderBuffer.addMessage(msg1);
    reorderBuffer.reset(0);

    expect(reorderBuffer.getLastProcessedSeq()).toBe(0);
    expect(reorderBuffer.getBuffer()).toEqual([]);

    // Should be able to process 1 again
    expect(reorderBuffer.addMessage(msg1)).toEqual([msg1]);
  });
});
