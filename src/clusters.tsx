import { ServerConnection } from '@jupyterlab/services';

import { JSONObject } from '@phosphor/coreutils';

import { Message } from '@phosphor/messaging';

import { Widget } from '@phosphor/widgets';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

/**
 * A widget for hosting Dask cluster management.
 */
export class DaskClusterManager extends Widget {
  /**
   * Create a new Dask sidebar.
   */
  constructor(options: DaskClusterManager.IOptions = {}) {
    super();
    this._serverSettings = ServerConnection.makeSettings();
    const url = `${this._serverSettings.baseUrl}dask`;
    ServerConnection.makeRequest(url, {}, this._serverSettings)
      .then(response => response.json())
      .then(data => {
        console.log(data);
        this._clusters = data as IClusterModel[];
        this.update();
      });
  }

  /**
   * Handle an update request.
   */
  protected onUpdateRequest(msg: Message): void {
    // Don't bother if the sidebar is not visible
    if (!this.isVisible) {
      return;
    }

    ReactDOM.render(<ClusterListing clusters={this._clusters} />, this.node);
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(msg: Message): void {
    this.update();
  }

  private _clusters: IClusterModel[] = [];
  private _serverSettings: ServerConnection.ISettings;
}

/**
 * A namespace for DasClusterManager statics.
 */
export namespace DaskClusterManager {
  /**
   * Options for the constructor.
   */
  export interface IOptions {}
}

/**
 * A React component for a launcher button listing.
 */
export class ClusterListing extends React.Component<IClusterListingProps, {}> {
  /**
   * Render the listing.
   */
  render() {
    let listing = this.props.clusters.map(cluster => {
      return (
        <li
          className="dask-ClusterListing-item"
          id={cluster.id}
          key={cluster.id}
        >
          <p>{cluster.dashboard_link}</p>
        </li>
      );
    });

    // Return the JSX component.
    return (
      <div>
        <ul className="dask-ClusterListing-list">{listing}</ul>
      </div>
    );
  }
}

/**
 * Props for the dashboard listing component.
 */
export interface IClusterListingProps extends React.Props<ClusterListing> {
  /**
   * A list of dashboard items to render.
   */
  clusters: IClusterModel[];
}

/**
 * A namespace for DaskSidebar statics.
 */
export namespace DaskSidebar {
  /**
   * Options for the constructor.
   */
  export interface IOptions {}
}

/**
 * An interface dashboard launcher item.
 */
export interface IClusterModel extends JSONObject {
  id: string;
  dashboard_link: string;
  workers: number;
}
