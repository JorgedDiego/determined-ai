import { Form, Input } from 'antd';
import { ModalFuncProps } from 'antd/es/modal/Modal';
import yaml from 'js-yaml';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MonacoEditor from 'react-monaco-editor';

import useModal, { ModalHooks as Hooks } from 'shared/hooks/useModal/useModal';
import { hasObjectKeys, isObject, isString } from 'shared/utils/data';

import { TrialFilters } from './filters';
import css from './useModalCreateCollection.module.scss';

export interface FilterModalProps {
  filters?: TrialFilters
  initialModalProps?: ModalFuncProps;
}

interface ModalHooks extends Omit<Hooks, 'modalOpen'> {
  modalOpen: (props: FilterModalProps) => void;
}

const useModalViewFilters = (): ModalHooks => {
  const [ filters, setFilters ] = useState<TrialFilters>();

  const { modalOpen: openOrUpdate, modalRef, ...modalHook } = useModal();

  const modalContent = useMemo(() => {

    const nonEmptyFilters = Object.entries(filters ?? {})
      .filter(([ key, value ]) =>
        (key !== 'projectIds' && key !== 'workspaceIds') &&
        Array.isArray(value) || isString(value)
          ? value.length > 0
          : isObject(value)
            ? hasObjectKeys(value)
            : false)
      .map(([ key, value ]) => ({ [key]: value }))
      .sort()
      .reduce((a, b) => ({ ...a, ...b }), {});

    return (
      <Form autoComplete="off" className={css.base} layout="vertical">
        <MonacoEditor
          height="40vh"
          language="yaml"
          options={{
            cursorStyle: undefined,
            minimap: { enabled: false },
            occurrencesHighlight: false,
            readOnly: true,
          }}
          value={JSON.stringify(nonEmptyFilters, null, 2)}
        />
      </Form>
    );
  }, [ filters ]);

  const getModalProps = useCallback(
    (): ModalFuncProps => {
      const props = {
        closable: false,
        content: modalContent,
        icon: null,
        okCancel: false,
        title: 'Current Filters',
        width: 700,
      };
      return props;
    },
    [ modalContent ],
  );

  const modalOpen = useCallback(
    ({ initialModalProps, filters }: FilterModalProps) => {
      setFilters(filters);

      const newProps = {
        ...initialModalProps,
        ...getModalProps(),
      };
      openOrUpdate(newProps);
    },
    [ getModalProps, openOrUpdate ],
  );

  useEffect(() => {
    if (modalRef.current){
      openOrUpdate(getModalProps());
    }
  }, [ getModalProps, modalRef, openOrUpdate ]);

  return { modalOpen, modalRef, ...modalHook };
};

export default useModalViewFilters;
