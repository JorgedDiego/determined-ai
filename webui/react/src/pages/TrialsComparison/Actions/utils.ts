import { Action } from 'components/Table/TableBatch';
import { openOrCreateTensorBoard } from 'services/api';
import { ErrorLevel, ErrorType } from 'shared/utils/error';
import { CommandTask } from 'types';
import handleError from 'utils/error';
import { openCommand } from 'utils/wait';

import { TrialsSelectionOrCollection } from '../Collections/collections';

export enum TrialAction {
  AddTags = 'Add Tags',
  TagAndCollect = 'Tag and Collect',
  OpenTensorBoard = 'View in TensorBoard',
}

type trials = { trials: TrialsSelectionOrCollection }

export type TrialsActionHandler = (t: trials) => Promise<void> | void;

export const openTensorBoard = async ({ trials } : trials): Promise<void> => {
  if ('trialIds' in trials) {
    const result = await openOrCreateTensorBoard({ trialIds: trials.trialIds });
    if (result) openCommand(result as CommandTask);
  }
};

export const trialActionDefs: Record<TrialAction, Action<TrialAction>> = {
  [TrialAction.AddTags]: {
    bulk: true,
    label: TrialAction.AddTags,
    value: TrialAction.AddTags,
  },
  [TrialAction.TagAndCollect]: {
    bulk: false,
    label: TrialAction.TagAndCollect,
    value: TrialAction.TagAndCollect,
  },
  [TrialAction.OpenTensorBoard]: {
    bulk: false,
    label: TrialAction.OpenTensorBoard,
    value: TrialAction.OpenTensorBoard,
  },
};

export const dispatchTrialAction = async (
  action: TrialAction,
  trials: TrialsSelectionOrCollection,
  handler: TrialsActionHandler,
): Promise<void> => {
  try {
    await handler({ trials });
  } catch (e) {
    const publicSubject =
      action === TrialAction.OpenTensorBoard
        ? 'Unable to View TensorBoard for Selected Trials'
        : `Unable to ${action} Selected Trials`;
    handleError(e, {
      level: ErrorLevel.Error,
      publicMessage: 'Please try again later.',
      publicSubject,
      silent: false,
      type: ErrorType.Server,
    });
  }
};
