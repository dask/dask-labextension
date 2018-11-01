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
   * Create a new Dask cluster manager.
   */
  constructor(options: DaskClusterManager.IOptions) {
    super();
    this.addClass('dask-DaskClusterManager');

    this._serverSettings = ServerConnection.makeSettings();
    this._setDashboardUrl = options.setDashboardUrl;
    const layout = (this.layout = new PanelLayout());

    this.clusterListing = new Widget();
    this.clusterListing.addClass('dask-ClusterListing');

    const toolbar = new Toolbar<Widget>();
    const toolbarLabel = new Widget();
    toolbarLabel.node.textContent = 'CLUSTERS';
    toolbarLabel.addClass('dask-DaskClusterManager-label');
    toolbar.addItem('label', toolbarLabel);
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
    layout.addWidget(this.clusterListing);

    this._updateClusterList();
  }

  /**
   * Get the currently active clusters known to the manager.
   */
  get clusters(): IClusterModel[] {
    return this._clusters;
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
      <ClusterListing
        clusters={this._clusters}
        stopById={(id: string) => {
          return this._stopById(id);
        }}
        setDashboardUrl={this._setDashboardUrl}
      />,
      this.clusterListing.node
    );
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(msg: Message): void {
    this.update();
  }

  /**
   * Launch a new cluster on the server.
   */
  private async _launchCluster(): Promise<void> {
    const response = await ServerConnection.makeRequest(
      `${this._serverSettings.baseUrl}dask`,
      { method: 'PUT' },
      this._serverSettings
    );
    if (response.status !== 200) {
      throw new Error('Failed to start Dask cluster');
    }
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

  /**
   * Stop a cluster by its id.
   */
  private async _stopById(id: string): Promise<void> {
    const response = await ServerConnection.makeRequest(
      `${this._serverSettings.baseUrl}dask/${id}`,
      { method: 'DELETE' },
      this._serverSettings
    );
    if (response.status !== 204) {
      throw new Error(`Failed to close Dask cluster ${id}`);
    }
    await this._updateClusterList();
  }

  private clusterListing: Widget;
  private _clusters: IClusterModel[] = [];
  private _setDashboardUrl: (url: string) => void;
  private _serverSettings: ServerConnection.ISettings;
}

/**
 * A namespace for DasClusterManager statics.
 */
export namespace DaskClusterManager {
  /**
   * Options for the constructor.
   */
  export interface IOptions {
    /**
     * A callback to set the dashboard url.
     */
    setDashboardUrl: (url: string) => void;
  }
}

/**
 * A React component for a launcher button listing.
 */
function ClusterListing(props: IClusterListingProps) {
  let listing = props.clusters.map(cluster => {
    return (
      <ClusterListingItem
        key={cluster.id}
        cluster={cluster}
        stop={() => props.stopById(cluster.id)}
        setDashboardUrl={() => props.setDashboardUrl(cluster.dashboard_link)}
      />
    );
  });

  // Return the JSX component.
  return (
    <div>
      <ul className="dask-ClusterListing-list">{listing}</ul>
    </div>
  );
}

/**
 * Props for the cluster listing component.
 */
export interface IClusterListingProps {
  /**
   * A list of dashboard items to render.
   */
  clusters: IClusterModel[];

  /**
   * A function for stopping a cluster by ID.
   */
  stopById: (id: string) => Promise<void>;

  /**
   * A callback to set the dashboard URL.
   */
  setDashboardUrl: (url: string) => void;
}

/**
 * A TSX functional component for rendering a single running cluster.
 */
function ClusterListingItem(props: IClusterListingItemProps) {
  const { cluster, setDashboardUrl, stop } = props;
  return (
    <li className="dask-ClusterListingItem" data-cluster-id={cluster.id}>
      <span className="dask-DaskLogo jp-Icon jp-Icon-16" />
      <span
        className="dask-ClusterListingItem-label"
        title={`${cluster.name}
Scheduler Address:  ${cluster.scheduler_address}
Dashboard URL:  ${cluster.dashboard_link}
Number of workers:  ${cluster.workers}`}
      >
        {cluster.name}
      </span>
      <button
        title={`Set Dashboard to ${cluster.name}`}
        className="jp-ToolbarButtonComponent"
        onClick={setDashboardUrl}
      >
        <span className="jp-LinkIcon jp-Icon jp-Icon-16 jp-ToolbarButtonComponent-icon" />
      </button>
      <button
        title={`Shutdown ${cluster.name}`}
        className="jp-ToolbarButtonComponent"
        onClick={stop}
      >
        <span className="jp-CloseIcon jp-Icon jp-Icon-16 jp-ToolbarButtonComponent-icon" />
      </button>
    </li>
  );
}

/**
 * Props for the cluster listing component.
 */
export interface IClusterListingItemProps {
  /**
   * A cluster model to render.
   */
  cluster: IClusterModel;

  /**
   * A function for stopping the cluster.
   */
  stop: () => Promise<void>;

  /**
   * A callback function to set the Dask dashboard url.
   */
  setDashboardUrl: () => void;
}

/**
 * An interface dashboard launcher item.
 */
export interface IClusterModel extends JSONObject {
  /**
   * A unique string ID for the cluster.
   */
  id: string;

  /**
   * A display name for the cluster.
   */
  name: string;

  /**
   * A URI for the dask scheduler.
   */
  scheduler_address: string;

  /**
   * A URL for the Dask dashboard.
   */
  dashboard_link: string;

  /**
   * The number of workers for the cluster.
   */
  workers: number;
}