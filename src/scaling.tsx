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

/**
 * A component for an HTML form that allows the user
 * to select scaling parameters.
 */
export class ClusterScaling extends React.Component<
  ClusterScaling.IProps,
  ClusterScaling.IState
> {
  /**
   * Construct a new ClusterScaling component.
   */
  constructor(props: ClusterScaling.IProps) {
    super(props);
    let model: IUnionClusterModel;
    // If the initial model is static, enrich it
    // with placeholder values for minimum and maximum workers.
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

  /**
   * When the component updates we take the opportunity to write
   * the state of the cluster to an external object so this can
   * be sent as the result of the dialog.
   */
  componentDidUpdate(): void {
    let model: IUnionClusterModel = { ...this.state.model };
    if (model.scaling === 'static') {
      delete model['maximum'];
      delete model['minimum'];
    }
    this.props.stateEscapeHatch(this.state.model as IClusterModel);
  }

  /**
   * React to the number of workers changing.
   */
  onScaleChanged(event: React.ChangeEvent): void {
    this.setState({
      model: {
        ...this.state.model,
        workers: parseInt((event.target as HTMLInputElement).value, 10)
      }
    });
  }

  /**
   * React to the user selecting the adapt checkbox.
   */
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

  /**
   * React to the minimum slider changing. We also update the maximum
   * so that it is alway greater than or equal to the minimum.
   */
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

  /**
   * React to the maximum slider changing. We also update the minimum
   * so that it is always less than or equal to the maximum.
   */
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

  /**
   * Render the component..
   */
  render() {
    const model = this.state.model;
    const adaptive = model.scaling === 'adaptive';
    const disabledClass = 'dask-mod-disabled';
    return (
      <div>
        <span className="dask-ScalingHeader">Manual Scaling</span>
        <div className="dask-ScalingSection">
          <div className="dask-ScalingSection-item">
            <span
              className={`dask-ScalingSection-label ${
                adaptive ? disabledClass : ''
              }`}
            >
              Workers
            </span>
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
        </div>
        <div className="dask-ScalingHeader">
          Adaptive Scaling
          <input
            className="dask-ScalingCheckbox"
            type="checkbox"
            onChange={evt => {
              this.onScalingChanged(evt);
            }}
          />
        </div>
        <div className="dask-ScalingSection">
          <div className="dask-ScalingSection-item">
            <span
              className={`dask-ScalingSection-label ${
                !adaptive ? disabledClass : ''
              }`}
            >
              Minimum workers
            </span>
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
        </div>
        <div className="dask-ScalingSection">
          <div className="dask-ScalingSection-item">
            <span
              className={`dask-ScalingSection-label ${
                !adaptive ? disabledClass : ''
              }`}
            >
              Maximum workers
            </span>
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
      </div>
    );
  }
}

/**
 * Show a dialog for scaling a cluster model.
 *
 * @param model: the initial model.
 *
 * @returns a promse that resolves with the user-selected scalings for the
 *   cluster model. If they pressed the cancel button, it resolves with
 *   the original model.
 */
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
