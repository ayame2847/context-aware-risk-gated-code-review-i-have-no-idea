import { parseSnapshot, type ReviewRepository } from "../domain/review";

export const snapshotRepository: ReviewRepository = {
  async load(signal) {
    signal?.throwIfAborted();
    const [cases, records] = await Promise.all([
      import("../../../docs/progress/2026-09-28/cases.json"),
      import("../../../docs/progress/2026-09-28/records.json"),
    ]);
    signal?.throwIfAborted();
    return parseSnapshot(cases.default, records.default);
  },
};
