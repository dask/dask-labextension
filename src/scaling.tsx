import { Dialog, showDialog } from '@jupyterlab/apputils';

import {
  IAdaptiveClusterModel,
  IClusterModel,
  IStaticClusterModel
} from './clusters';
import * as React from 'react';

/**
 * A namespace for ClusterScaling statics.
 */
namespace ClusterScaling {
  /**
   * The props for the ClusterScaling component.
   */
  export interface IProps {
    /**
     * The initial cluster model shown in the scaling.
     */
    initialModel: IClusterModel;

    /**
     * A callback that allows the component to write state to an
     * external object.
     */
    stateEscapeHatch: (model: IClusterModel) => void;
  }

  /**
   * The state for the ClusterScaling component.
   */
  export interface IState {
    /**
     * The proposed cluster model shown in the scaling.
     */
    model: IUnionClusterModel;
  }
}

export class ClusterScaling extends React.Component<
  ClusterScaling.IProps,
  ClusterScaling.IState
> {
  constructor(props: ClusterScaling.IProps) {
    super(props);
    let model: IUnionClusterModel;
    if (props.initialModel.scaling === 'static') {
      model = {
        ...(props.initialModel as IStaticClusterModel),
        minimum: props.initialModel.workers,
        maximum: props.initialModel.workers
      } as IUnionClusterModel;
    } else {
      model = props.initialModel as IUnionClusterModel;
    }

    this.state = { model };
  }

  componentDidUpdate(): void {
    let model: IUnionClusterModel = { ...this.state.model };
    if (model.scaling === 'static') {
      delete model['maximum'];
      delete model['minimum'];
    }
    this.props.stateEscapeHatch(this.state.model as IClusterModel);
  }

  onScaleChanged(event: React.ChangeEvent): void {
    this.setState({
      model: {
        ...this.state.model,
        workers: parseInt((event.target as HTMLInputElement).value, 10)
      }
    });
  }

  onScalingChanged(event: React.ChangeEvent): void {
    const value = (event.target as HTMLInputElement).checked;
    const scaling = value ? 'adaptive' : 'static';
    this.setState({
      model: {
        ...this.state.model,
        scaling
      } as IUnionClusterModel
    });
  }

  onMinimumChanged(event: React.ChangeEvent): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const minimum = Math.max(0, value);
    const maximum = Math.max(this.state.model.maximum, minimum);
    this.setState({
      model: {
        ...this.state.model,
        workers: minimum,
        maximum,
        minimum
      }
    });
  }
  onMaximumChanged(event: React.ChangeEvent): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const maximum = Math.max(0, value);
    const minimum = Math.min(this.state.model.minimum, maximum);
    this.setState({
      model: {
        ...this.state.model,
        workers: minimum,
        maximum,
        minimum
      }
    });
  }

  render() {
    const model = this.state.model;
    const adaptive = model.scaling === 'adaptive';
    return (
      <div>
        <span className="dask-ScalingHeader">Manual Scaling</span>
        <div className="dask-ScalingSection">
          <input
            className="dask-ScalingInput"
            disabled={adaptive}
            value={model.workers}
            type="number"
            step="1"
            onChange={evt => {
              this.onScaleChanged(evt);
            }}
          />
        </div>
        <span className="dask-ScalingHeader">Adaptive Scaling</span>
        <input
          className="dask-ScalingCheckbox"
          type="checkbox"
          onChange={evt => {
            this.onScalingChanged(evt);
          }}
        />
        <div className="dask-ScalingSection">
          <span>Minimum workers</span>
          <input
            className="dask-ScalingInput"
            disabled={!adaptive}
            type="number"
            value={(model as IAdaptiveClusterModel).minimum}
            step="1"
            onChange={evt => {
              this.onMinimumChanged(evt);
            }}
          />
        </div>
        <div className="dask-ScalingSection">
          <span>Maximum workers</span>
          <input
            className="dask-ScalingInput"
            disabled={!adaptive}
            type="number"
            value={(model as IAdaptiveClusterModel).maximum}
            step="1"
            onChange={evt => {
              this.onMaximumChanged(evt);
            }}
          />
        </div>
      </div>
    );
  }
}

export function showScalingDialog(
  model: IClusterModel
): Promise<IClusterModel> {
  let updatedModel = { ...model };
  const escapeHatch = (update: IClusterModel) => {
    updatedModel = update;
  };

  return showDialog({
    title: `Scale ${model.name}`,
    body: (
      <ClusterScaling initialModel={model} stateEscapeHatch={escapeHatch} />
    ),
    buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'SCALE' })]
  }).then(result => {
    if (result.button.accept) {
      return updatedModel;
    } else {
      return model;
    }
  });
}

/**
 * A module-private union type so that we always can refer
 * to the maximum/minimum values for the current cluster model
 * when we are in the dialog.
 */
type IUnionClusterModel = IStaticClusterModel & IAdaptiveClusterModel;
