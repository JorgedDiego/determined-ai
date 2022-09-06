import { rename } from 'fs';

import { Button, Dropdown, Menu, Select, Tooltip } from 'antd';
import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { InteractiveTableSettings } from 'components/Table/InteractiveTable';
import { useStore } from 'contexts/Store';
import useSettings, { BaseType, SettingsConfig, SettingsHook } from 'hooks/useSettings';
import useStorage from 'hooks/useStorage';
import { deleteTrialsCollection, getTrialsCollections, patchTrialsCollection } from 'services/api';
import Icon from 'shared/components/Icon';
import { clone, isNumber, numberElseUndefined } from 'shared/utils/data';
import { ErrorType } from 'shared/utils/error';
import handleError from 'utils/error';

import { decodeTrialsCollection, encodeTrialsCollection } from '../api';

import { TrialsCollection } from './collections';
import { FilterSetter, SetFilters, TrialFilters, TrialSorter } from './filters';
import useModalTrialCollection, { CollectionModalProps } from './useModalCreateCollection';
import useModalRenameCollection from './useModalRenameCollection';
import useModalViewFilters from './useModalViewFilters';
import css from './useTrialCollections.module.scss';

export interface TrialsCollectionInterface {
  collection: string;
  collections: TrialsCollection[];
  controls: JSX.Element;
  fetchCollections: () => Promise<TrialsCollection[] | undefined>;
  filters: TrialFilters;
  openCreateModal: (p: CollectionModalProps) => void;
  resetFilters: () => void;
  saveCollection: (name: string) => Promise<void>;
  setCollection: (name: string) => void;
  setFilters: SetFilters;
  setNewCollection: (c: TrialsCollection) => Promise<void>;
  sorter: TrialSorter;
}

const collectionStoragePath = (projectId: string) => `collection/${projectId}`;

const configForProject = (projectId: string): SettingsConfig => ({
  applicableRoutespace: '/trials',
  settings: [
    {
      defaultValue: '',
      key: 'collection',
      storageKey: 'collection',
      type: { baseType: BaseType.String },
    } ],
  storagePath: collectionStoragePath(projectId),
});

const comparableStringification = (filters?: TrialFilters, sorter?: TrialSorter): string =>
  JSON.stringify([ ...Object.entries(filters ?? {}), ...Object.entries(sorter ?? {}) ].sort());

const defaultRanker = {
  rank: '0',
  sorter: { sortDesc: false, sortKey: 'searcherMetricValue' },
};

const getDefaultFilters = (projectId: string) => (
  {
    experimentIds: [],
    hparams: {},
    projectIds: [ String(projectId) ],
    ranker: clone(defaultRanker),
    searcher: '',
    states: [],
    tags: [],
    trainingMetrics: {},
    trialIds: [],
    userIds: [],
    validationMetrics: {},
    workspaceIds: [],
  });

const defaultSorter: TrialSorter = {
  sortDesc: true,
  sortKey: 'trialId',
};

export const useTrialCollections = (
  projectId: string,
  tableSettingsHook: SettingsHook<InteractiveTableSettings>,
): TrialsCollectionInterface => {
  const { settings: tableSettings, updateSettings: updateTableSettings } = tableSettingsHook;
  const filterStorage = useStorage(`trial-filters}/${projectId ?? 1}`);
  const initFilters = filterStorage.getWithDefault<TrialFilters>(
    'filters',
    getDefaultFilters(projectId),
  );

  const { auth: { user } } = useStore();

  const userId = useMemo(() => user?.id ? String(user?.id) : '', [ user?.id ]);

  const [
    // eslint-disable-next-line array-element-newline
    filters,  // external filters
    _setFilters, // only use thru below wrapper
  ] = useState<TrialFilters>(initFilters);

  const setFilters = useCallback(
    (fs: FilterSetter) => {
      _setFilters((filters) => {
        if (!filters) return filters;
        const f = fs(filters);
        filterStorage.set('filters', f);
        return f;
      });
    },
    [ filterStorage ],
  );

  const sorter: TrialSorter = useMemo(() => ({
    ...defaultSorter,
    sortDesc: tableSettings.sortDesc,
    sortKey: tableSettings.sortKey ? String(tableSettings.sortKey) : '',
  }), [ tableSettings.sortDesc, tableSettings.sortKey ]);

  const filtersStringified = useMemo(
    () => comparableStringification(filters, sorter),
    [ filters, sorter ],
  );

  const [ collectionFiltersStringified, setCollectionFiltersStringified ] =
  useState<string | undefined>();

  const hasUnsavedFilters = useMemo(
    () => {
      if (!collectionFiltersStringified) return false;
      const unsaved = filtersStringified !== collectionFiltersStringified;

      return unsaved;
    },
    [ collectionFiltersStringified, filtersStringified ],
  );

  const resetFilters = useCallback(() => {
    filterStorage.remove('filters');
  }, [ filterStorage ]);

  const [ collections, setCollections ] = useState<TrialsCollection[]>([]);

  const settingsConfig = useMemo(() => configForProject(projectId), [ projectId ]);

  const { settings, updateSettings } = useSettings<{ collection: string }>(settingsConfig);

  const previousCollectionStorage = useStorage(`previous-collection/${projectId}`);

  const getPreviousCollection = useCallback(
    () => previousCollectionStorage.get('collection'),
    [ previousCollectionStorage ],
  );

  const setPreviousCollection = useCallback(
    (c) => previousCollectionStorage.set('collection', c),
    [ previousCollectionStorage ],
  );

  const setCollection = useCallback(
    (name: string) => {
      const _collection = collections.find((c) => c.name === name);
      if (_collection?.name != null) {
        updateSettings({ collection: _collection.name }, true);
      }
    },
    [ collections, updateSettings ],
  );

  const fetchCollections = useCallback(async () => {
    const id = parseInt(projectId);
    if (isNumber(id)) {
      const response = await getTrialsCollections(id);
      const collections =
        response.collections
          ?.map(decodeTrialsCollection)
          .sort((a, b) => Number(b.userId === userId) - Number(a.userId === userId)) ?? [];
      setCollections(collections);
      return collections;
    }
  }, [ projectId, userId ]);

  useEffect(() => {
    fetchCollections();
  }, [ fetchCollections ]);

  const saveCollection = useCallback(async () => {
    const _collection = collections.find((c) => c.name === settings?.collection);
    const newCollection = { ..._collection, filters, sorter } as TrialsCollection;
    await patchTrialsCollection(encodeTrialsCollection(newCollection));
    fetchCollections();
  }, [ collections, filters, settings?.collection, sorter, fetchCollections ]);

  const deleteCollection = useCallback(async () => {
    try {
      const _collection = collections.find((c) => c.name === settings?.collection);
      const id = numberElseUndefined(_collection?.id);
      if (isNumber(id)){
        await deleteTrialsCollection(id);
      }
      fetchCollections();
      setCollection(collections[0]?.name);
    } catch (e) {
      handleError(e, {
        publicMessage: 'Please try again later.',
        publicSubject: 'Unable to delete collection.',
        silent: false,
        type: ErrorType.Api,
      });
    }
  }, [ collections, fetchCollections, settings?.collection, setCollection ]);

  useEffect(() => {
    const _collection = collections.find((c) => c.name === settings?.collection);
    const previousCollection = getPreviousCollection();
    setCollectionFiltersStringified(
      comparableStringification(_collection?.filters, _collection?.sorter),
    );

    if (_collection && JSON.stringify(_collection) !== JSON.stringify(previousCollection)) {
      setFilters(() => _collection.filters);
      updateTableSettings({
        sortDesc: _collection.sorter.sortDesc,
        sortKey: _collection.sorter.sortKey,
      });
      setPreviousCollection(_collection);
    }
  }, [
    settings?.collection,
    collections,
    getPreviousCollection,
    setPreviousCollection,
    updateTableSettings,
    setFilters,
  ]);

  const userOwnsCollection = useMemo(() => {
    if (user?.isAdmin) return true;

    const _collection = collections.find((c) => c.name === settings?.collection);
    return _collection?.userId === userId;

  }, [ userId, user?.isAdmin, collections, settings?.collection ]);

  const setNewCollection = useCallback(
    async (newCollection?: TrialsCollection) => {
      if (!newCollection) return;
      try {
        const newCollections = await fetchCollections();
        const _collection = newCollections?.find((c) => c.name === newCollection.name);
        if (_collection?.name != null) {
          updateSettings({ collection: _collection.name }, true);
        }
        if (newCollection) setCollection(newCollection.name);
      } catch (e) {
        handleError(e, {
          publicMessage: 'Please try again later.',
          publicSubject: 'Unable to fetch new collection.',
          silent: false,
          type: ErrorType.Api,
        });
      }
    },
    [ fetchCollections, setCollection, updateSettings ],
  );

  const { modalOpen, contextHolder: collectionContextHolder } = useModalTrialCollection({
    onConfirm: setNewCollection,
    projectId,
  });

  const createCollectionFromFilters = useCallback(() => {
    modalOpen({ trials: { filters, sorter } });
  }, [ filters, modalOpen, sorter ]);

  const resetFiltersToCollection = useCallback(() => {
    const filters = collections.find((c) => c.name === settings?.collection)?.filters;
    if (filters)
      setFilters(() => filters);

    const sorter = collections.find((c) => c.name === settings?.collection)?.sorter;
    if (sorter)
      updateTableSettings({ ...sorter });

  }, [ settings?.collection, collections, updateTableSettings, setFilters ]);

  const clearFilters = useCallback(() => {
    const filters = collections.find((c) => c.name === settings?.collection)?.filters;
    if (filters)
      setFilters(() => getDefaultFilters(projectId));

  }, [ projectId, collections, settings?.collection, setFilters ]);

  const { modalOpen: openFiltersModal, contextHolder: viewFiltersContextHolder } =
    useModalViewFilters();

  const viewFilters = useCallback(() => {
    openFiltersModal({ filters });
  }, [ filters, openFiltersModal ]);

  const handleRenameComplete = useCallback(async (name: string) => {
    await fetchCollections();
    updateSettings({ collection: name });
  }, [ fetchCollections, updateSettings ]);

  const { modalOpen: openRenameModal, contextHolder: renameContextHolder } =
    useModalRenameCollection({ onComplete: handleRenameComplete });

  const renameCollection = useCallback(() => {
    const id = collections.find((c) => c.name === settings?.collection)?.id;
    if (id)
      openRenameModal({ id, name: settings.collection });
  }, [ collections, settings.collection, openRenameModal ]);

  const controls = (
    <div className={css.base}>
      <div className={css.options}>
        <Button onClick={createCollectionFromFilters}>New Collection</Button>
        <Select
          placeholder={collections?.length ? 'Select Collection' : 'No collections created'}
          status={hasUnsavedFilters ? 'warning' : undefined}
          style={{ width: '200px' }}
          value={settings.collection || undefined}
          onChange={(value) => setCollection(value)}>
          {[
            ...(collections?.map((collection) => (
              <Select.Option key={collection.name} value={collection.name}>
                {userId === collection.userId ? <Icon name="user-small" /> : '   '}{' '}
                {collection.name}
              </Select.Option>
            )) ?? []),
          ]}
        </Select>
        <Tooltip title="View Active Filters">
          <Button
            ghost={!hasUnsavedFilters}
            icon={<Icon name="settings" />}
            onClick={viewFilters}
          />
        </Tooltip>
        <Tooltip title="Save Collection">
          <Button
            disabled={!userOwnsCollection}
            ghost={!hasUnsavedFilters}
            icon={<Icon name="checkmark" />}
            onClick={saveCollection}
          />
        </Tooltip>
        <Tooltip title="Reset Filters to Collection">
          <Button
            ghost={!hasUnsavedFilters}
            icon={<Icon name="reset" />}
            onClick={resetFiltersToCollection}
          />
        </Tooltip>
        <Dropdown
          overlay={(
            <Menu
              items={
                [
                  {
                    disabled: !userOwnsCollection,
                    key: 'ren',
                    label: 'Rename Collection',
                    onClick: renameCollection,
                  },
                  {
                    disabled: !userOwnsCollection,
                    key: 'del',
                    label: 'Delete Collection',
                    onClick: deleteCollection,
                  },
                  {
                    key: 'clr',
                    label: 'Clear Filters',
                    onClick: clearFilters,
                  },
                ]
              }
            />
          )}
          trigger={[ 'click' ]}>
          <Button
            className={[ css.optionsDropdown, css.optionsDropdownFourChild ].join(' ')}
            ghost
            icon={<Icon name="overflow-vertical" />}
          />
        </Dropdown>
        {viewFiltersContextHolder}
        {collectionContextHolder}
        {renameContextHolder}
      </div>
    </div>
  );

  return {
    collection: settings.collection,
    collections,
    controls,
    fetchCollections,
    filters,
    openCreateModal: modalOpen,
    resetFilters,
    saveCollection,
    setCollection,
    setFilters,
    setNewCollection,
    sorter,
  };
};
