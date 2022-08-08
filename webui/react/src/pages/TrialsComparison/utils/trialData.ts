import { V1AugmentedTrial } from 'services/api-ts-sdk';
import { Primitive, RawJson } from 'shared/types';
import { flattenObject } from 'shared/utils/data';
import { union } from 'shared/utils/set';
import {
  Metric,
  MetricType,
} from 'types';

function mergeLists<T>(A: Array<T>, B: Array<T>, equalFn = (x: T, y: T) => x === y): Array<T> {
  return [ ...A, ...B.filter((b) => !A.some((a) => equalFn(a, b))) ];
}

const metricEquals = (A: Metric, B: Metric) => {
  return A.type === B.type && A.name === B.name;
};

const valMapForHParams = (hparams: RawJson): HpValsMap =>
  Object.entries(flattenObject(hparams || {}))
    .map(([ key, value ]) => ({ [String(key)]: new Set([ value ]) }))
    .reduce((a, b) => ({ ...a, ...b }), {});

const mergeHpValMaps = (A: HpValsMap, B: HpValsMap): HpValsMap => {
  const hps = mergeLists(Object.keys(A), Object.keys(B));
  return hps.map((hp) => ({ [hp]: union(A[hp] ?? new Set(), B[hp] ?? new Set()) }))
    .reduce((a, b) => ({ ...a, ...b }), {});
};

const aggregateHpVals = (agg: HpValsMap, hparams: RawJson) =>
  mergeHpValMaps(agg, valMapForHParams(hparams));

const namesForMetrics = (trainingMetrics: RawJson, validationMetrics: RawJson): Metric[] =>
  [ ...Object.keys(trainingMetrics)
    .map((name) => ({ name, type: MetricType.Training } as Metric)),
  ...Object.keys(validationMetrics)
    .map((name) => ({ name, type: MetricType.Validation } as Metric)),
  ];

export type HpValsMap = Record<string, Set<Primitive>>

export interface TrialsWithMetadata {
  hpVals: HpValsMap;
  maxBatch: number;
  metrics: Metric[];
  trialIds: number[];
  trials: V1AugmentedTrial[];
}

export const aggregrateTrialsMetadata =
(agg: TrialsWithMetadata, trial: V1AugmentedTrial): TrialsWithMetadata => ({
  hpVals: aggregateHpVals(agg.hpVals, trial.hparams),
  maxBatch: Math.max(agg.maxBatch, trial.totalBatches),
  metrics: mergeLists(
    agg.metrics,
    namesForMetrics(trial.trainingMetrics, trial.validationMetrics),
    metricEquals,
  ),
  trialIds: [ ...agg.trialIds, trial.trialId ],
  trials: [ ...agg.trials, trial ],
});

export const defaultTrialData: TrialsWithMetadata = {
  hpVals: {},
  maxBatch: 1,
  metrics: [],
  trialIds: [],
  trials: [],
};