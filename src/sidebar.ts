import { Widget, PanelLayout } from '@lumino/widgets';
import { CommandRegistry } from '@lumino/commands';

import { DaskDashboardLauncher, IDashboardItem } from './dashboard';

import { DaskClusterManager, IClusterModel } from './clusters';

/**
 * A widget for hosting Dask dashboard launchers.
 */
export class DaskSidebar extends Widget {
  /**
   * Create a new Dask sidebar.
   */
  constructor(options: DaskSidebar.IOptions) {
    super();
    this.addClass('dask-DaskSidebar');
    let layout = (this.layout = new PanelLayout());

    // Add the dashboard component/
    this._dashboard = new DaskDashboardLauncher({
      launchItem: options.launchDashboardItem,
      linkFinder: options.linkFinder
    });

    // A callback that sets the url of the dashboard component.
    const setDashboardUrl = (url: string) => {
      this._dashboard.input.url = url;
    };
    const injectClientCodeForCluster = options.clientCodeInjector;
    const getClientCodeForCluster = options.clientCodeGetter;
    // Add the cluster manager component.
    this._clusters = new DaskClusterManager({
      registry: options.registry,
      launchClusterId: options.launchClusterId,
      setDashboardUrl,
      injectClientCodeForCluster,
      getClientCodeForCluster
    });
    layout.addWidget(this._dashboard);
    layout.addWidget(this._clusters);
  }

  /**
   * Get the dashboard launcher associated with the sidebar.
   */
  get dashboardLauncher(): DaskDashboardLauncher {
    return this._dashboard;
  }

  /**
   * Get the cluster manager associated with the sidebar.
   */
  get clusterManager(): DaskClusterManager {
    return this._clusters;
  }

  private _dashboard: DaskDashboardLauncher;
  private _clusters: DaskClusterManager;
}

/**
 * A namespace for DaskSidebar statics.
 */
export namespace DaskSidebar {
  /**
   * Options for the constructor.
   */
  export interface IOptions {
    /**
     * Registry of all commands
     */
    registry: CommandRegistry;

    /**
     * The launchCluster command ID.
     */
    launchClusterId: string;

    /**
     * A callback to launch a dashboard item.
     */
    launchDashboardItem: (item: IDashboardItem) => void;

    /**
     * A function that attempts to find a link to
     * a dask bokeh server in the current application
     * context.
     */
    linkFinder?: () => Promise<string>;

    /**
     * A function that injects client-connection code for a given cluster.
     */
    clientCodeInjector: (model: IClusterModel) => void;

    /**
     * A function that gets client-connection code for a given cluster.
     */
    clientCodeGetter: (model: IClusterModel) => string;
  }
}
