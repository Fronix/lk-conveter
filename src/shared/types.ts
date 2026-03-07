// LegendKeeper .lk export schema types

export interface LkExport {
  version: number;
  exportId: string;
  exportedAt: string;
  resources: LkResource[];
  calendars: LkCalendar[];
  resourceCount: number;
  hash: string;
}

export interface LkResource {
  schemaVersion: number;
  id: string;
  name: string;
  parentId?: string;
  pos: string;
  aliases: string[];
  tags: string[];
  banner: LkBanner;
  createdBy?: string;
  iconColor: string;
  iconGlyph: string;
  iconShape: string;
  isHidden: boolean;
  isLocked: boolean;
  showPropertyBar: boolean;
  properties: LkProperty[];
  documents: LkDocument[];
}

export interface LkBanner {
  enabled: boolean;
  url: string;
  yPosition: number;
}

export interface LkProperty {
  id: string;
  pos: string;
  title: string;
  type: string;
}

export interface LkDocument {
  id: string;
  name: string;
  pos: string;
  type: string;
  isFirst: boolean;
  isHidden: boolean;
  locatorId: string;
  createdAt: string;
  updatedAt: string;
  transforms: unknown[];
  sources: unknown[];
  presentation: LkPresentation;
  content: ProseMirrorNode;
}

export interface LkPresentation {
  documentType: string;
}

// ProseMirror document model

export interface ProseMirrorNode {
  type: string;
  content?: ProseMirrorNode[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: ProseMirrorMark[];
}

export interface ProseMirrorMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// Calendar types

export interface LkCalendar {
  id: string;
  name: string;
  hasZeroYear: boolean;
  maxMinutes: number;
  months: LkMonth[];
  leapDays: unknown[];
  weekdays: LkWeekday[];
  epochWeekday: number;
  weekResetsEachMonth: boolean;
  hoursInDay: number;
  minutesInHour: number;
  negativeEra: LkEra;
  positiveEras: LkEra[];
  moons: LkMoon[];
  format: LkCalendarFormat;
  halfClock: boolean;
}

export interface LkMonth {
  id: string;
  name: string;
  isIntercalary: boolean;
  length: number;
  interval: number;
  offset: number;
}

export interface LkWeekday {
  id: string;
  name: string;
}

export interface LkEra {
  id: string;
  name: string;
  abbr: string;
  hideAbbr: boolean;
  startsAt: number;
  resetMode: string;
}

export interface LkMoon {
  id: string;
  name: string;
  phase: number;
  shift: number;
  color: string;
}

export interface LkCalendarFormat {
  id: string;
  year: string;
  month: string;
  day: string;
  time: string;
}

// Metadata file stored alongside markdown output (per-source)
export interface LkMeta {
  version: number;
  exportId: string;
  exportedAt: string;
  calendars: LkCalendar[];
  resourceCount: number;
  hash: string;
  // Raw content for skipped documents (map, time, board)
  skippedDocuments: Record<string, SkippedDocument>;
}

// Multi-source metadata file — supports co-located .lk exports
export interface LkMetaMulti {
  sources: Record<string, LkMeta>;
}

export interface SkippedDocument {
  resourceId: string;
  document: LkDocument;
}

// Document types that should not be converted to markdown
export const SKIPPED_DOC_TYPES = new Set(['map', 'time', 'board']);
