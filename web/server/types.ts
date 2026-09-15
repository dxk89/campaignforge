/** Firestore document shapes. These are the Phase 1 contract from docs/build/02. */

export type Palette = { accents: string[]; dark: string; light: string; sources?: string[] };

export type BrandKit = {
  siteName: string;
  tagline: string | null;
  palette: Palette | null;
  fonts: string[];
  fontUrl?: string | null;
  logoRef: string | null;
  artworkRefs: string[];
  scannedAt: string | null;
  pages?: { url: string; title: string }[];
};

export type Voice = {
  observations: string[];
  preferredTerms: string[];
  avoidTerms: string[];
  glossary: { term: string; treatment: string }[];
};

export type ClientSettings = {
  landingUrl: string | null;
  defaultTone: string;
  defaultLanguages: string[];
  calendar: { events: { date: string; label: string; kind?: string }[] };
};

export type Client = {
  clientId: string;
  name: string;
  domain: string | null;
  createdAt: string;
  updatedAt: string;
  brandKit: BrandKit;
  voice: Voice;
  /**
   * Protects a curated client from deletion. Set and cleared by an admin
   * only; it blocks deletion for everyone, including the admin, who must
   * unlock first. That friction is the point: the thing most worth locking
   * is the demonstration campaign, and the person most likely to delete it by
   * accident is its owner.
   */
  locked?: boolean;
  settings: ClientSettings;
  nuelink?: NuelinkMapping;
};

/** Which Nuelink brand and, per social channel, which collection a post goes to. */
export type NuelinkMapping = {
  brandId: number | null;
  collections: Partial<Record<'linkedin' | 'x' | 'instagram', number | null>>;
};

export type NuelinkResult = {
  day: number; channel: string; scheduledAt: string | null;
  status: 'posted' | 'failed' | 'skipped';
  nuelinkPostId: string | null; mediaId: string | null; error: string | null;
};

/** One attempt to send a calendar to Nuelink. Kept so a second push skips what went. */
export type NuelinkPush = {
  pushId: string; createdAt: string; startDate: string;
  publishMode: 'DRAFT' | 'SCHEDULE'; skipWeekends: boolean;
  results: NuelinkResult[];
};

export type SourceDoc = {
  sourceId: string;
  name: string;
  kind: 'file' | 'url' | 'site' | 'paste' | 'brief';
  storageRef: string | null;
  text: string;
  chars: number;
  fetchedAt: string;
  hash: string;
};

export type Brief = {
  clientName?: string;
  productName: string;
  productDescription: string;
  targetAudience: string;
  objective: string;
  tone: string;
  languages: string[];
  landingUrl?: string | null;
  webResearch?: boolean;
  startDate?: string | null;
};

export type Campaign = {
  campaignId: string;
  brief: Brief;
  status: 'draft' | 'generating' | 'review' | 'approved' | 'exported';
  createdAt: string;
  updatedAt: string;
  current: Record<string, string>; // agent -> versionId
};

export type Usage = {
  input: number; output: number; webSearches?: number; calls?: number; ms: number; costEur: number; model?: string;
};

export type Version = {
  versionId: string;
  agent: string;
  output: unknown;
  inputsHash: string;
  promptVersion: string | null;
  model: string;
  usage: Usage;
  trace: unknown[];
  complete: boolean;
  problems: string[];
  parentVersionId: string | null;
  changeNote: string | null;
  createdAt: string;
};

export type LedgerEntry = {
  entryId: string;
  clientId: string | null;
  campaignId: string | null;
  agent: string;
  model: string;
  input: number;
  output: number;
  webSearches: number;
  images: number;
  costEur: number;
  at: string;
};
