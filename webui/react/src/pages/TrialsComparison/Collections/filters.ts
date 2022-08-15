import { V1TrialSorter } from 'services/api-ts-sdk';

export interface NumberRange {
  max?: string;
  min?: string;
}

export type NumberRangeDict = Record<string, NumberRange>

export interface ranker {
  rank?: string;
  sorter: V1TrialSorter;
}

export interface TrialFilters {
  experimentIds?: string[];
  hparams?: NumberRangeDict;
  projectIds?: string[];
  ranker?: ranker;
  searcher?: string;
  tags?: string[];
  trainingMetrics?: NumberRangeDict;
  userIds?: string[];
  validationMetrics?:NumberRangeDict;
  workspaceIds?: string[];
}

export type FilterSetter = (prev: TrialFilters) => TrialFilters

export type SetFilters = (fs: FilterSetter) => void;