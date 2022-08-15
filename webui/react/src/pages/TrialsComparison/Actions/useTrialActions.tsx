import React, { ReactNode, useCallback, useState } from 'react';

import TableBatch from 'components/TableBatch';
import { V1TrialSorter } from 'services/api-ts-sdk';

import { encodeIdList } from '../api';
import { TrialFilters } from '../Collections/filters';
import { CollectionModalProps } from '../Collections/useModalCreateCollection';
import { TrialsCollectionSpec, TrialsSelection } from '../Collections/useTrialCollections';

import useModalTrialTag from './useModalTagTrials';
import {
  dispatchTrialAction,
  openTensorBoard,
  TrialAction,
  trialActionDefs,
  TrialsActionHandler,
} from './utils';

export interface TrialActionsInterface {
  dispatcher: ReactNode;
  modalContextHolders: React.ReactElement[];
  selectAllMatching: boolean;
  selectTrial: (ids: unknown) => void;
  selectedTrials: number[];
}

interface Props {
  filters: TrialFilters
  openCreateModal: (p: CollectionModalProps) => void;
  sorter: V1TrialSorter;
}

const useTrialActions = ({ filters, sorter, openCreateModal }: Props): TrialActionsInterface => {

  const [ selectedTrials, setSelectedTrials ] = useState<number[]>([]);

  const [ selectAllMatching, setSelectAllMatching ] = useState<boolean>(false);
  const handleChangeSelectionMode = useCallback(() => setSelectAllMatching((prev) => !prev), []);

  const selectTrial = useCallback((rowKeys) => setSelectedTrials(
    encodeIdList(rowKeys) ?? [],
  ), []);
  // const handleTableChange = useCallback((pageSize) => setPageSize(pageSize), []);

  const clearSelected = useCallback(() => {
    setSelectedTrials([]);
  }, []);

  const {
    contextHolder,
    modalOpen,
  } = useModalTrialTag({});

  const handleBatchAction = useCallback(async (action: string) => {
    const trials = selectAllMatching
      ? { filters, sorter } as TrialsCollectionSpec
      : { sorter: sorter, trialIds: selectedTrials } as TrialsSelection;

    const handle = async (handler: TrialsActionHandler) =>
      await dispatchTrialAction(action as TrialAction, trials, handler);

    await (
      action === TrialAction.AddTags
        ? handle(modalOpen)
        : action === TrialAction.TagAndCollect
          ? handle(openCreateModal)
          : action === TrialAction.OpenTensorBoard
            ? handle(openTensorBoard)
            : Promise.resolve()
    );
  }, [
    selectedTrials,
    modalOpen,
    selectAllMatching,
    sorter,
    filters,
    openCreateModal,
  ]);

  const dispatcher = (
    <TableBatch
      actions={Object.values(trialActionDefs)}
      selectAllMatching={selectAllMatching}
      selectedRowCount={selectedTrials.length}
      onAction={handleBatchAction}
      onChangeSelectionMode={handleChangeSelectionMode}
      onClear={clearSelected}
    />
  );

  return {
    dispatcher,
    modalContextHolders: [ contextHolder ],
    selectAllMatching,
    selectedTrials,
    selectTrial,
  };
};
export default useTrialActions;