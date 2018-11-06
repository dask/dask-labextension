import { Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { ServerConnection } from '@jupyterlab/services';

import { JSONObject, JSONExt } from '@phosphor/coreutils';

import { Message } from '@phosphor/messaging';

import { Widget, PanelLayout } from '@phosphor/widgets';

import { showScalingDialog } from './scaling';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

const REFRESH_INTERVAL = 5000;

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

    this._clusterListing = new Widget();
    this._clusterListing.addClass('dask-ClusterListing');

    // Create the toolbar.
    const toolbar = new Toolbar<Widget>();

    // Make a label widget for the toolbar.
    const toolbarLabel = new Widget();
    toolbarLabel.node.textContent = 'CLUSTERS';
    toolbarLabel.addClass('dask-DaskClusterManager-label');
    toolbar.addItem('label', toolbarLabel);

    // Make a refresh button for the toolbar.
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

    // Make a shutdown button for the toolbar.
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
    layout.addWidget(this._clusterListing);

    // Do an initial refresh of the cluster list.
    this._updateClusterList();
    // Also refresh periodically.
    window.setInterval(() => {
      this._updateClusterList();
    }, REFRESH_INTERVAL);
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
        scaleById={(id: string) => {
          return this._scaleById(id);
        }}
        stopById={(id: string) => {
          return this._stopById(id);
        }}
        setDashboardUrl={this._setDashboardUrl}
      />,
      this._clusterListing.node
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

  /**
   * Scale a cluster by its id.
   */
  private async _scaleById(id: string): Promise<void> {
    const cluster = this._clusters.find(c => c.id === id);
    if (!cluster) {
      throw Error(`Failed to find cluster ${id} to scale`);
    }
    const update = await showScalingDialog(cluster);
    if (JSONExt.deepEqual(update, cluster)) {
      // If the user canceled, or the model is identical don't try to update.
      return Promise.resolve(void 0);
    }

    const response = await ServerConnection.makeRequest(
      `${this._serverSettings.baseUrl}dask/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(update)
      },
      this._serverSettings
    );
    if (response.status !== 200) {
      throw new Error(`Failed to scale cluster ${id}`);
    }
    await this._updateClusterList();
  }

  private _clusterListing: Widget;
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
        scale={() => props.scaleById(cluster.id)}
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
   * Scale a cluster by id.
   */
  scaleById: (id: string) => Promise<void>;

  /**
   * A callback to set the dashboard URL.
   */
  setDashboardUrl: (url: string) => void;
}

/**
 * A TSX functional component for rendering a single running cluster.
 */
function ClusterListingItem(props: IClusterListingItemProps) {
  const { cluster, scale, setDashboardUrl, stop } = props;
  let title = `${cluster.name}
Scheduler Address:  ${cluster.scheduler_address}
Dashboard URL:  ${cluster.dashboard_link}
Number of Workers:  ${cluster.workers}`;
  if (cluster.scaling === 'adaptive') {
    title = `${title}
Minimum Number of Workers: ${cluster.minimum}
Maximum Number of Workers: ${cluster.maximum}`;
  }
  return (
    <li className="dask-ClusterListingItem" data-cluster-id={cluster.id}>
      <span className="dask-ClusterListingItem-label" title={title}>
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
        title={`Scale ${cluster.name}`}
        className="jp-ToolbarButtonComponent"
        onClick={scale}
      >
        <span className="dask-ScaleIcon jp-Icon jp-Icon-16 jp-ToolbarButtonComponent-icon" />
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
   * A function for scaling the cluster.
   */
  scale: () => Promise<void>;

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
 * An interface for a JSON-serializable representation of a cluster.
 */
export interface IBaseClusterModel extends JSONObject {
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

  /**
   * The scaling type of the cluster model.
   */
  scaling: 'static' | 'adaptive';
}

export interface IStaticClusterModel extends IBaseClusterModel {
  /**
   * The scaling type of the cluster model.
   */
  scaling: 'static';
}

export interface IAdaptiveClusterModel extends IBaseClusterModel {
  /**
   * The scaling type of the cluster model.
   */
  scaling: 'adaptive';

  /**
   * The minimum number of workers.
   */
  minimum: number;

  /**
   * The maximum number of workers.
   */
  maximum: number;
}

export type IClusterModel = IStaticClusterModel | IAdaptiveClusterModel;
