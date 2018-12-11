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

    // A function to set the active cluster.
    this._setActiveById = (id: string) => {
      const cluster = this._clusters.find(c => c.id === id);
      if (!cluster) {
        return;
      }
      options.setDashboardUrl(`dask/dashboard/${cluster.id}`);
      this._activeClusterId = id;
      this.update();
    };

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
        label: 'NEW',
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
        activeClusterId={this._activeClusterId}
        scaleById={(id: string) => {
          return this._scaleById(id);
        }}
        stopById={(id: string) => {
          return this._stopById(id);
        }}
        setActiveById={this._setActiveById}
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
      `${this._serverSettings.baseUrl}dask/clusters`,
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
      `${this._serverSettings.baseUrl}dask/clusters`,
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
      `${this._serverSettings.baseUrl}dask/clusters/${id}`,
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
      `${this._serverSettings.baseUrl}dask/clusters/${id}`,
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
  private _activeClusterId: string = '';
  private _setActiveById: (id: string) => void;
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
        isActive={cluster.id === props.activeClusterId}
        key={cluster.id}
        cluster={cluster}
        scale={() => props.scaleById(cluster.id)}
        stop={() => props.stopById(cluster.id)}
        setActive={() => props.setActiveById(cluster.id)}
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
   * The id of the active cluster.
   */
  activeClusterId: string;

  /**
   * A function for stopping a cluster by ID.
   */
  stopById: (id: string) => Promise<void>;

  /**
   * Scale a cluster by id.
   */
  scaleById: (id: string) => Promise<void>;

  /**
   * A callback to set the active cluster by id.
   */
  setActiveById: (id: string) => void;
}

/**
 * A TSX functional component for rendering a single running cluster.
 */
function ClusterListingItem(props: IClusterListingItemProps) {
  const { cluster, isActive, setActive, scale, stop } = props;
  let itemClass = 'dask-ClusterListingItem';
  itemClass = isActive ? `${itemClass} jp-mod-active` : itemClass;

  let minimum: JSX.Element | null = null;
  let maximum: JSX.Element | null = null;
  if (cluster.scaling === 'adaptive') {
    minimum = (
      <div className="dask-ClusterListingItem-stats">
        Minimum Workers: {cluster.minimum}
      </div>
    );
    maximum = (
      <div className="dask-ClusterListingItem-stats">
        Maximum Workers: {cluster.maximum}
      </div>
    );
  }

  return (
    <li
      className={itemClass}
      data-cluster-id={cluster.id}
      onClick={evt => {
        setActive();
        evt.stopPropagation();
      }}
    >
      <div className="dask-ClusterListingItem-title">{cluster.name}</div>
      <div
        className="dask-ClusterListingItem-link"
        title={cluster.scheduler_address}
      >
        Scheduler Address: {cluster.scheduler_address}
      </div>
      <div className="dask-ClusterListingItem-link">
        Dashboard URL:{' '}
        <a
          target="_blank"
          href={cluster.dashboard_link}
          title={cluster.dashboard_link}
        >
          {cluster.dashboard_link}
        </a>
      </div>
      <div className="dask-ClusterListingItem-stats">
        Number of Cores: {cluster.cores}
      </div>
      <div className="dask-ClusterListingItem-stats">
        Memory: {cluster.memory}
      </div>
      <div className="dask-ClusterListingItem-stats">
        Number of Workers: {cluster.workers}
      </div>
      {minimum}
      {maximum}
      <div className="dask-ClusterListingItem-button-panel">
        <button
          className="dask-ClusterListingItem-button dask-ClusterListingItem-scale jp-mod-styled"
          onClick={evt => {
            scale();
            evt.stopPropagation();
          }}
          title={`Rescale ${cluster.name}`}
        >
          SCALE
        </button>
        <button
          className="dask-ClusterListingItem-button dask-ClusterListingItem-stop jp-mod-styled"
          onClick={evt => {
            stop();
            evt.stopPropagation();
          }}
          title={`Shutdown ${cluster.name}`}
        >
          SHUTDOWN
        </button>
      </div>
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
   * Whether the cluster is currently active (i.e., if
   * it is being displayed in the dashboard).
   */
  isActive: boolean;

  /**
   * A function for scaling the cluster.
   */
  scale: () => Promise<void>;

  /**
   * A function for stopping the cluster.
   */
  stop: () => Promise<void>;

  /**
   * A callback function to set the active cluster.
   */
  setActive: () => void;
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
   * Total number of cores used by the cluster.
   */
  cores: number;

  /**
   * Total memory used by the cluster, as a human-readable string.
   */
  memory: string;

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
