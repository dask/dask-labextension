import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { ServerConnection } from '@jupyterlab/services';

import { JSONObject } from '@phosphor/coreutils';

import { Message } from '@phosphor/messaging';

import { Widget, PanelLayout } from '@phosphor/widgets';

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
    const layout = (this.layout = new PanelLayout());
    this._serverSettings = ServerConnection.makeSettings();

    this._clusterList = new Widget();
    this._clusterList.addClass('dask-ClusterListing');

    const toolbar = new Toolbar<Widget>();
    toolbar.addItem(
      'refresh',
      new ToolbarButton({
        iconClassName: 'jp-RefreshIcon jp-Icon jp-Icon-16',
        onClick: () => {
          this._updateClusterList();
        },
        tooltip: 'Refresh Cluster List'
      })
    );
    toolbar.addItem(
      'new',
      new ToolbarButton({
        iconClassName: 'jp-AddIcon jp-Icon jp-Icon-16',
        onClick: () => {
          this._launchCluster();
        },
        tooltip: 'Start New Dask Cluster'
      })
    );

    layout.addWidget(toolbar);
    layout.addWidget(this._clusterList);

    this._updateClusterList();
  }

  /**
   * Handle an update request.
   */
  protected onUpdateRequest(msg: Message): void {
    // Don't bother if the sidebar is not visible
    if (!this.isVisible) {
      return;
    }

    ReactDOM.render(
      <ClusterListing clusters={this._clusters} />,
      this._clusterList.node
    );
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(msg: Message): void {
    this.update();
  }

  /**
   * Refresh the list of clusters on the server.
   */
  private async _launchCluster(): Promise<void> {
    const response = await ServerConnection.makeRequest(
      `${this._serverSettings.baseUrl}dask`,
      { method: 'PUT' },
      this._serverSettings
    );
    const data = (await response.json()) as IClusterModel;
    console.log(data.id);
    await this._updateClusterList();
  }

  /**
   * Refresh the list of clusters on the server.
   */
  private async _updateClusterList(): Promise<void> {
    const response = await ServerConnection.makeRequest(
      `${this._serverSettings.baseUrl}dask`,
      {},
      this._serverSettings
    );
    const data = (await response.json()) as IClusterModel[];
    this._clusters = data;
    this.update();
  }

  private _clusterList: Widget;
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
