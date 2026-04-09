/**
 * Navigation Types — Aging Parents Plan
 * Source: app-flow-pages-and-roles.md §1 "Site Map"
 */

import { CaptureInput } from '../contracts/schema';

export type PlaceholderParams = { title?: string; sprint?: number };

export type RootStackParamList = {
  // Parent flows
  ParentHome: undefined;
  Capture: { isLateCapture?: boolean } | undefined;
  Processing: { visitId: string; captureInput: CaptureInput };
  SummaryReview: { summaryId: string };
  ReminderSetup: { summaryId: string };
  Share: { summaryId: string };
  PastVisits: undefined;
  ApprovalQueue: PlaceholderParams | undefined;
  Settings: undefined;

  // Adult child flows (Sprint 2+)
  AdultChildHome: PlaceholderParams | undefined;
  SharedSummary: { summaryId?: string } & PlaceholderParams;
  OpenTasks: PlaceholderParams | undefined;
  AssistedCapture: PlaceholderParams | undefined;
};
