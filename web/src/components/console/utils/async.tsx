import * as _ from 'lodash-es';
import { LoadingBox } from '../console-shared/src/components/loading/LoadingBox';
import { Component } from 'react';
import type { ComponentType, ReactNode } from 'react';

/**
 * FIXME: Comparing two functions is not the *best* solution, but we can handle false negatives.
 */
const sameLoader = (a: () => Promise<ComponentType>) => (b: () => Promise<ComponentType>) =>
  a?.name === b?.name && (a || 'a').toString() === (b || 'b').toString();

enum AsyncComponentError {
  ComponentNotFound = 'COMPONENT_NOT_FOUND',
}

export class AsyncComponent extends Component<AsyncComponentProps, AsyncComponentState> {
  state: AsyncComponentState = { Component: null, loader: null };
  props: AsyncComponentProps;

  private retryCount = 0;
  private maxRetries = 25;
  private isAsyncMounted = false;

  static getDerivedStateFromProps(props, state) {
    if (!sameLoader(props.loader)(state.loader)) {
      return { Component: null, loader: props.loader };
    }
    return null;
  }

  componentDidUpdate() {
    if (this.state.Component === null) {
      this.loadComponent();
    }
  }

  componentDidMount() {
    this.isAsyncMounted = true;
    if (this.state.Component === null) {
      this.loadComponent();
    }
  }

  componentWillUnmount() {
    this.isAsyncMounted = false;
  }

  private loadComponent() {
    this.state
      .loader()
      .then((Component) => {
        if (!Component) {
          return Promise.reject(AsyncComponentError.ComponentNotFound);
        }
        if (this.isAsyncMounted) {
          this.setState({ Component });
        }
      })
      .catch((error) => {
        if (error === AsyncComponentError.ComponentNotFound) {
          // eslint-disable-next-line no-console
          console.error('Component does not exist in module');
        } else {
          setTimeout(() => this.loadComponent(), this.retryAfter);
        }
      });
  }

  private get retryAfter(): number {
    this.retryCount++;
    const base = this.retryCount < this.maxRetries ? this.retryCount : this.maxRetries;
    return 100 * Math.pow(base, 2);
  }

  render() {
    const { Component } = this.state;
    const { LoadingComponent = LoadingBox, forwardRef } = this.props;
    const rest = _.omit(this.props, 'loader');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return Component != null ? <Component ref={forwardRef} {...rest} /> : <LoadingComponent />;
  }
}

type AsyncComponentProps = {
  loader: () => Promise<ComponentType>;
  LoadingComponent?: ReactNode;
} & any;
type AsyncComponentState = {
  Component: ComponentType;
  loader: () => Promise<ComponentType>;
};
