import * as React from 'react';
import { Alert, Panel, PanelMain, PanelMainBody } from '@patternfly/react-core';

const ErrorAlert: React.FC<{ error: Error }> = ({ error }) => {
  return (
    <Alert isInline title={error.name} variant="danger">
      <Panel isScrollable>
        <PanelMain maxHeight="100px">
          <PanelMainBody>{error.message}</PanelMainBody>
        </PanelMain>
      </Panel>
    </Alert>
  );
};

export default ErrorAlert;
