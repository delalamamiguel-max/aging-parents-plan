/**
 * App State Store — Aging Parents Plan
 * Source: contracts/schema.ts; masterplan.md §9
 *
 * Lightweight in-memory + AsyncStorage state.
 * In Sprint 2+ this will connect to cloud storage.
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import {
  VisitSummary,
  CaptureInput,
  LinkPermission,
  ShareRecord,
  SummarySection,
  ActionItem,
  SECTION_ORDER,
  SummaryStatus,
} from '../contracts/schema';
import { readState, writeState } from './storage/utils';
import { PersistedState } from './storage/types';

// ─── State shape ──────────────────────────────────────────────────────────────

interface AppState {
  // Auth / identity
  currentRole: 'parent' | 'adult_child' | null;
  parentId: string | null;
  adultChildId: string | null;

  // Summaries
  summaries: VisitSummary[];
  activeSummaryId: string | null;  // currently being reviewed/edited

  // Capture
  pendingCapture: CaptureInput | null;

  // Linking
  link: LinkPermission | null;
  sharedSummaryIds: string[];  // adult child sees these

  // App state
  isProcessing: boolean;
  processingMessage: string;
  isOffline: boolean;
  offlineCaptureQueue: CaptureInput[];

  // Preferences
  language: 'en' | 'es';

  // Persistence
  isHydrated: boolean; // true once initial load from disk finishes
  
  // Offline State Tracking
  currentlyProcessingQueueId: string | null;
}

const initialState: AppState = {
  currentRole: null,
  parentId: null,
  adultChildId: null,
  summaries: [],
  activeSummaryId: null,
  pendingCapture: null,
  link: null,
  sharedSummaryIds: [],
  isProcessing: false,
  processingMessage: '',
  isOffline: false,
  offlineCaptureQueue: [],
  language: 'en',
  isHydrated: false,
  currentlyProcessingQueueId: null,
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type AppAction =
  | { type: 'SET_ROLE'; role: 'parent' | 'adult_child'; id: string }
  | { type: 'SET_PENDING_CAPTURE'; capture: CaptureInput }
  | { type: 'CLEAR_PENDING_CAPTURE' }
  | { type: 'ADD_SUMMARY'; summary: VisitSummary }
  | { type: 'UPDATE_SUMMARY'; summaryId: string; updates: Partial<VisitSummary> }
  | { type: 'UPDATE_SECTION'; summaryId: string; section: SummarySection }
  | { type: 'SET_ACTIVE_SUMMARY'; summaryId: string | null }
  | { type: 'SET_PROCESSING'; isProcessing: boolean; message?: string }
  | { type: 'SET_OFFLINE'; isOffline: boolean }
  | { type: 'QUEUE_OFFLINE_CAPTURE'; capture: CaptureInput }
  | { type: 'DEQUEUE_OFFLINE_CAPTURE'; captureId: string }
  | { type: 'SET_LINK'; link: LinkPermission | null }
  | { type: 'SHARE_SUMMARY'; summaryId: string; sharedAt: string }
  | { type: 'REVOKE_SUMMARY'; summaryId: string; revokedAt: string }
  | { type: 'SET_SUMMARY_STATUS'; summaryId: string; status: SummaryStatus }
  | { type: 'SET_LANGUAGE'; language: 'en' | 'es' }
  | { type: 'HYDRATE'; state: Partial<AppState> }
  | { type: 'START_OFFLINE_PROCESSING'; captureId: string }
  | { type: 'CANCEL_OFFLINE_PROCESSING' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_ROLE':
      return {
        ...state,
        currentRole: action.role,
        ...(action.role === 'parent' ? { parentId: action.id } : { adultChildId: action.id }),
      };

    case 'SET_PENDING_CAPTURE':
      return { ...state, pendingCapture: action.capture };

    case 'CLEAR_PENDING_CAPTURE':
      return { ...state, pendingCapture: null };

    case 'ADD_SUMMARY':
      return { ...state, summaries: [action.summary, ...state.summaries] };

    case 'UPDATE_SUMMARY':
      return {
        ...state,
        summaries: state.summaries.map((s) =>
          s.id === action.summaryId
            ? { ...s, ...action.updates, updatedAt: new Date().toISOString() }
            : s
        ),
      };

    case 'UPDATE_SECTION':
      return {
        ...state,
        summaries: state.summaries.map((s) => {
          if (s.id !== action.summaryId) return s;
          const sections = s.sections.map((sec) =>
            sec.sectionType === action.section.sectionType ? action.section : sec
          );
          return { ...s, sections, updatedAt: new Date().toISOString() };
        }),
      };

    case 'SET_ACTIVE_SUMMARY':
      return { ...state, activeSummaryId: action.summaryId };

    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.isProcessing,
        processingMessage: action.message ?? state.processingMessage,
      };

    case 'SET_OFFLINE':
      return { ...state, isOffline: action.isOffline };

    case 'QUEUE_OFFLINE_CAPTURE':
      return { ...state, offlineCaptureQueue: [...state.offlineCaptureQueue, action.capture] };

    case 'DEQUEUE_OFFLINE_CAPTURE':
      return {
        ...state,
        offlineCaptureQueue: state.offlineCaptureQueue.filter((c) => c.id !== action.captureId),
        currentlyProcessingQueueId: null, // clear marker on successful dequeue
      };

    case 'START_OFFLINE_PROCESSING':
      return { ...state, currentlyProcessingQueueId: action.captureId };

    case 'CANCEL_OFFLINE_PROCESSING':
      return { ...state, currentlyProcessingQueueId: null };

    case 'SET_LINK':
      return { ...state, link: action.link };

    case 'SHARE_SUMMARY':
      return {
        ...state,
        sharedSummaryIds: [...state.sharedSummaryIds, action.summaryId],
        summaries: state.summaries.map((s) =>
          s.id === action.summaryId
            ? { ...s, status: 'shared' as SummaryStatus, sharedAt: action.sharedAt }
            : s
        ),
      };

    case 'REVOKE_SUMMARY':
      return {
        ...state,
        sharedSummaryIds: state.sharedSummaryIds.filter((id) => id !== action.summaryId),
        summaries: state.summaries.map((s) =>
          s.id === action.summaryId
            ? { ...s, status: 'revoked' as SummaryStatus, revokedAt: action.revokedAt }
            : s
        ),
      };

    case 'SET_SUMMARY_STATUS':
      return {
        ...state,
        summaries: state.summaries.map((s) =>
          s.id === action.summaryId ? { ...s, status: action.status } : s
        ),
      };

    case 'SET_LANGUAGE':
      return { ...state, language: action.language };

    case 'HYDRATE':
      return { ...state, ...action.state, isHydrated: true };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // Convenience selectors
  activeSummary: VisitSummary | null;
  sharedSummaries: VisitSummary[];
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Hydrate from Storage on mount
  useEffect(() => {
    readState().then((savedState) => {
      if (savedState) {
        dispatch({ type: 'HYDRATE', state: savedState });
      } else {
        // No saved state or error — still mark as hydrated to allow new saves
        dispatch({ type: 'HYDRATE', state: {} });
      }
    });
  }, []);

  // Persist on every state change (only key fields)
  useEffect(() => {
    if (!state.isHydrated) return; // DON'T persist until hydration finished

    const toPersist: PersistedState = {
      currentRole: state.currentRole,
      parentId: state.parentId,
      adultChildId: state.adultChildId,
      summaries: state.summaries,
      link: state.link,
      sharedSummaryIds: state.sharedSummaryIds,
      offlineCaptureQueue: state.offlineCaptureQueue,
      language: state.language,
    };
    writeState(toPersist);
  }, [
    state.isHydrated,
    state.currentRole,
    state.parentId,
    state.adultChildId,
    state.summaries,
    state.link,
    state.sharedSummaryIds,
    state.offlineCaptureQueue,
    state.language,
  ]);

  const activeSummary =
    state.activeSummaryId != null
      ? (state.summaries.find((s) => s.id === state.activeSummaryId) ?? null)
      : null;

  const sharedSummaries = state.summaries.filter((s) =>
    state.sharedSummaryIds.includes(s.id)
  );

  return (
    <AppContext.Provider value={{ state, dispatch, activeSummary, sharedSummaries }}>
      {children}
    </AppContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAppState = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
};
