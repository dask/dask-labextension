import { Dialog, showDialog } from '@jupyterlab/apputils';

import { IClusterModel } from './clusters';
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
    model: IClusterModel;

    /**
     * Whether the proposed cluster is adaptive. We keep
     * an extra flag here so that the transient adaptive
     * min/max in the `model` is not overwritten while
     * the user interacts with the dialog.
     */
    adaptive: boolean;
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
    let model: IClusterModel;
    const adaptive = !!props.initialModel.adapt;
    // If the initial model is static, enrich it
    // with placeholder values for minimum and maximum workers.
    if (!adaptive) {
      model = {
        ...props.initialModel,
        adapt: {
          minimum: props.initialModel.workers,
          maximum: props.initialModel.workers
        }
      };
    } else {
      model = props.initialModel;
    }

    this.state = { adaptive, model };
  }

  /**
   * When the component updates we take the opportunity to write
   * the state of the cluster to an external object so this can
   * be sent as the result of the dialog.
   */
  componentDidUpdate(): void {
    let model: IClusterModel = { ...this.state.model };
    if (!this.state.adaptive) {
      model.adapt = null;
    }
    this.props.stateEscapeHatch(model);
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
    this.setState({
      model: this.state.model,
      adaptive: value
    });
  }

  /**
   * React to the minimum slider changing. We also update the maximum
   * so that it is alway greater than or equal to the minimum.
   */
  onMinimumChanged(event: React.ChangeEvent): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const minimum = Math.max(0, value);
    const maximum = Math.max(this.state.model.adapt!.maximum, minimum);
    this.setState({
      model: {
        ...this.state.model,
        adapt: {
          maximum,
          minimum
        }
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
    const minimum = Math.min(this.state.model.adapt!.minimum, maximum);
    this.setState({
      model: {
        ...this.state.model,
        adapt: {
          maximum,
          minimum
        }
      }
    });
  }

  /**
   * Render the component..
   */
  render() {
    const model = this.state.model;
    const adapt = model.adapt!;
    const adaptive = this.state.adaptive;
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
            checked={adaptive}
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
              value={adapt.minimum}
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
              value={adapt.maximum}
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
