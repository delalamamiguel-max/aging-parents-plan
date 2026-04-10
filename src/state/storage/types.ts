import {
  VisitSummary,
  LinkPermission,
  CaptureInput,
} from '../../contracts/schema';

/**
 * The subset of AppState that is persisted to local storage.
 */
export interface PersistedState {
  currentRole: 'parent' | 'adult_child' | null;
  parentId: string | null;
  adultChildId: string | null;
  summaries: VisitSummary[];
  link: LinkPermission | null;
  sharedSummaryIds: string[];
  offlineCaptureQueue: CaptureInput[];
  language: 'en' | 'es';
}
