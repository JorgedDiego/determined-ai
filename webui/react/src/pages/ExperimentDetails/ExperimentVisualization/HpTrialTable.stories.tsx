import React from 'react';

import { HyperparameterType, MetricType } from 'types';

import HpTrialTable from './HpTrialTable';

export default {
  component: HpTrialTable,
  parameters: { layout: 'padded' },
  title: 'HpTrialTable',
};

export const Default = (): React.ReactNode => (
  <HpTrialTable
    experimentId={1}
    hyperparameters={{ xyz: { type: HyperparameterType.Categorical, vals: [ true, false ] } }}
    metric={{ name: 'metricA', type: MetricType.Training }}
    trialHps={[
      { hparams: { xyz: true }, id: 1, metric: 0.3 },
      { hparams: { xyz: false }, id: 2, metric: 1.23 },
    ]}
    trialIds={[ 1, 2 ]}
  />
);
