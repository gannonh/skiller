import type { ScanTargetsResult } from "@skiller/core";

export type LeaderboardType = "all-time" | "trending" | "hot";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "warning" | "error";
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface SkillMetadata {
  id: string;
  name: string;
  description?: string;
  libraryPath: string;
  installedAt: string;
  lastCheckedAt?: string;
  keepUpdated: boolean;
  validation: ValidationResult;
  enabledTargets: string[];
}

export type DiscoverSkill = Record<string, unknown>;

export interface ScanError {
  message: string;
}

export type RemoveListener = () => void;

export interface SkillerApi {
  listLibrary: () => Promise<SkillMetadata[]>;
  scanTargets: () => Promise<ScanTargetsResult>;
  leaderboard: (type: LeaderboardType) => Promise<{ skills: DiscoverSkill[] }>;
  search: (query: string) => Promise<{ skills: DiscoverSkill[] }>;
  onCheckUpdates: (callback: () => void) => RemoveListener;
  onScanError: (callback: (error: ScanError) => void) => RemoveListener;
}

declare global {
  interface Window {
    skiller: SkillerApi;
  }
}

export const skillerApi = window.skiller;
