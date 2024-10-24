import * as _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';

import { useBoolean } from './hooks/useBoolean';

// TODO: These will be available in future versions of the plugin SDK
import { formatPrometheusDuration, parsePrometheusDuration } from './console/utils/datetime';

const OFF_KEY = 'OFF_KEY';

type Props = {
  interval: number;
  setInterval: (v: number) => void;
  id?: string;
};

const IntervalDropdown: React.FC<Props> = ({ id, interval, setInterval }) => {
  const [isOpen, toggleIsOpen, setOpen, setClosed] = useBoolean(false);
  const { t } = useTranslation(process.env.I18N_NAMESPACE);

  const onSelect = React.useCallback(
    (v: string) => setInterval(v === OFF_KEY ? null : parsePrometheusDuration(v)),
    [setInterval],
  );

  const intervalOptions = {
    [OFF_KEY]: t('Refresh off'),
    '15s': t('{{count}} second', { count: 15 }),
    '30s': t('{{count}} second', { count: 30 }),
    '1m': t('{{count}} minute', { count: 1 }),
    '5m': t('{{count}} minute', { count: 5 }),
    '15m': t('{{count}} minute', { count: 15 }),
    '30m': t('{{count}} minute', { count: 30 }),
    '1h': t('{{count}} hour', { count: 1 }),
    '2h': t('{{count}} hour', { count: 2 }),
    '1d': t('{{count}} day', { count: 1 }),
  };

  const selectedKey = interval === null ? OFF_KEY : formatPrometheusDuration(interval);

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle
      id={`${id}-dropdown`}
      onClick={toggleIsOpen}
      isExpanded={isOpen}
      ref={toggleRef}
      className="monitoring-dashboards__dropdown-button"
    >
      {intervalOptions[selectedKey]}
    </MenuToggle>
  );

  return (
    <Select
      isOpen={isOpen}
      onSelect={(_event, value: string) => {
        if (value) {
          onSelect(value);
        }
        setClosed();
      }}
      toggle={toggle}
      className="monitoring-dashboards__variable-dropdown"
      onOpenChange={(open) => (open ? setOpen() : setClosed())}
    >
      <SelectList>
        {_.map(intervalOptions, (name, key) => (
          <SelectOption key={key} value={key} isSelected={key === selectedKey}>
            {name}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
};

export default IntervalDropdown;
