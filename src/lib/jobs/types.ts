export type JobType =
  | "GENERATE_PRODUCTS"
  | "GENERATE_COLLECTIONS"
  | "APPLY"
  | "MATCHING";

export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type JobItemStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";

export const ALLOWED_BATCH_SIZES = [10, 25, 50] as const;
export type BatchSize = (typeof ALLOWED_BATCH_SIZES)[number];
