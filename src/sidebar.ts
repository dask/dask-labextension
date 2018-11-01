import { CommandRegistry } from '@phosphor/commands';

import { Widget, PanelLayout } from '@phosphor/widgets';

import { DaskDashboardLauncher, normalizeDashboardUrl } from './dashboard';

import { DaskClusterManager } from './clusters';

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
    this._dashboard = new DaskDashboardLauncher({
      commands: options.commands,
      linkFinder: options.linkFinder
    });
    const setDashboardUrl = (url: string) => {
      this._dashboard.input.url = normalizeDashboardUrl(url);
    };
    this._clusters = new DaskClusterManager({ setDashboardUrl });
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
     * The document manager for the application.
     */
    commands: CommandRegistry;

    /**
     * A function that attempts to find a link to
     * a dask bokeh server in the current application
     * context.
     */
    linkFinder?: () => Promise<string>;
  }
}
