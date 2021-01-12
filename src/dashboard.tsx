import { IFrame, MainAreaWidget, ToolbarButton } from '@jupyterlab/apputils';

import { PageConfig, URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

import { searchIcon } from '@jupyterlab/ui-components';

import { JSONExt, JSONObject } from '@lumino/coreutils';

import { Poll } from '@lumino/polling';

import { ISignal, Signal } from '@lumino/signaling';

import { Widget, PanelLayout } from '@lumino/widgets';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

/**
 * Info for a a given dashboard URL.
 */
export type DashboardURLInfo = {
  /**
   * The user provided url in the search box.
   */
  url: string;

  /**
   * Whether there is a live dashboard at the URL.
   */
  isActive: boolean;

  /**
   * A new URL to use after redirects or proxies.
   */
  effectiveUrl?: string;

  /**
   * A mapping from individual dashboard plot names to their sub-path.
   */
  plots: { [name: string]: string };
};

/**
 * A class for hosting a Dask dashboard in an iframe.
 */
export class DaskDashboard extends MainAreaWidget<IFrame> {
  /**
   * Construct a new dashboard widget.
   */
  constructor() {
    super({
      // Disable allow some iframe extensions to let server requests
      // and scripts to execute in the bokeh server context.
      // This is unsafe, but we presumably trust the code in the bokeh server.
      content: new IFrame({ sandbox: ['allow-scripts', 'allow-same-origin'] })
    });
    this._inactivePanel = Private.createInactivePanel();
    this.content.node.appendChild(this._inactivePanel);
    this.update();
  }

  /**
   * The current dashboard item for the widget.
   */
  get item(): IDashboardItem | null {
    return this._item;
  }
  set item(value: IDashboardItem | null) {
    if (JSONExt.deepEqual(value, this._item)) {
      return;
    }
    this._item = value;
    this.update();
  }

  /**
   * The current dashboard URL for the widget.
   */
  get dashboardUrl(): string {
    return this._dashboardUrl;
  }
  set dashboardUrl(value: string) {
    if (value === this._dashboardUrl) {
      return;
    }
    this._dashboardUrl = Private.normalizeDashboardUrl(value);
    this.update();
  }

  /**
   * Whether the dashboard is active. When inactive,
   * it will show a placeholder panel.
   */
  get active(): boolean {
    return this._active;
  }
  set active(value: boolean) {
    if (value === this._active) {
      return;
    }
    this._active = value;
    this.update();
  }

  /**
   * Handle an update request to the dashboard panel.
   */
  protected onUpdateRequest(): void {
    // If there is nothing to show, empty the iframe URL and
    // show the inactive panel.
    if (!this.item || !this.dashboardUrl || !this.active) {
      this.content.url = '';
      this._inactivePanel.style.display = '';
      return;
    }
    // Make sure the inactive panel is hidden
    this._inactivePanel.style.display = 'none';
    this.content.url = URLExt.join(this.dashboardUrl, this.item.route);
  }

  private _item: IDashboardItem | null = null;
  private _dashboardUrl: string = '';
  private _active: boolean = false;
  private _inactivePanel: HTMLElement;
}

/**
 * A widget for hosting Dask dashboard launchers.
 */
export class DaskDashboardLauncher extends Widget {
  /**
   * Create a new Dask sidebar.
   */
  constructor(options: DaskDashboardLauncher.IOptions) {
    super();
    let layout = (this.layout = new PanelLayout());
    this._dashboard = new Widget();
    this._serverSettings = ServerConnection.makeSettings();
    this._input = new URLInput(this._serverSettings, options.linkFinder);
    layout.addWidget(this._input);
    layout.addWidget(this._dashboard);
    this.addClass('dask-DaskDashboardLauncher');
    this._items = options.items || DaskDashboardLauncher.DEFAULT_ITEMS;
    this._launchItem = options.launchItem;
    this._input.urlInfoChanged.connect(this._updateLinks, this);
  }

  private _updateLinks(_: URLInput, change: URLInput.IChangedArgs): void {
    if (!change.newValue.isActive) {
      this.update();
      return;
    }
    const result = Private.getDashboardPlots(change.newValue);
    this._items = result;
    this.update();
  }

  /**
   * The list of dashboard items which can be launched.
   */
  get items(): IDashboardItem[] {
    return this._items;
  }

  /**
   * Get the URL input widget.
   */
  get input(): URLInput {
    return this._input;
  }

  /**
   * Handle an update request.
   */
  protected onUpdateRequest(): void {
    // Don't bother if the sidebar is not visible
    if (!this.isVisible) {
      return;
    }

    ReactDOM.render(
      <DashboardListing
        launchItem={this._launchItem}
        isEnabled={this.input.urlInfo.isActive}
        items={this._items}
      />,
      this._dashboard.node
    );
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(): void {
    this.update();
  }

  private _dashboard: Widget;
  private _input: URLInput;
  private _launchItem: (item: IDashboardItem) => void;
  private _items: IDashboardItem[];
  private _serverSettings: ServerConnection.ISettings;
}

/**
 * A widget for hosting a url input element.
 */
export class URLInput extends Widget {
  /**
   * Construct a new input element.
   */
  constructor(
    serverSettings: ServerConnection.ISettings,
    linkFinder?: () => Promise<string>
  ) {
    super();
    this.addClass('dask-URLInput');
    const layout = (this.layout = new PanelLayout());
    const wrapper = new Widget();
    wrapper.addClass('dask-URLInput-wrapper');
    this._input = document.createElement('input');
    this._input.placeholder = 'DASK DASHBOARD URL';
    wrapper.node.appendChild(this._input);
    layout.addWidget(wrapper);

    this._serverSettings = serverSettings;

    if (linkFinder) {
      const findButton = new ToolbarButton({
        icon: searchIcon,
        onClick: async () => {
          let link = await linkFinder();
          if (link) {
            this.url = link;
          }
        },
        tooltip: 'Auto-detect dashboard URL'
      });
      layout.addWidget(findButton);
    }

    this._startUrlCheckTimer();
  }

  /**
   * The underlying input value.
   */
  get input(): HTMLInputElement {
    return this._input;
  }

  /**
   * The base url for the dask webserver.
   *
   * #### Notes
   * Setting this value will result in a urlChanged
   * signal being emitted, but it will happen asynchronously,
   * as it first checks to see whether the url is pointing
   * at a valid dask dashboard server.
   */
  set url(newValue: string) {
    this._input.value = newValue;
    const oldValue = this._urlInfo;
    if (newValue === oldValue.url) {
      return;
    }
    void Private.testDaskDashboard(newValue, this._serverSettings).then(
      result => {
        this._urlInfo = result;
        this._urlChanged.emit({ oldValue, newValue: result });
        this._input.blur();
        this.update();
        if (!result) {
          console.warn(
            `${newValue} does not appear to host a valid Dask dashboard`
          );
        }
      }
    );
  }

  /**
   * The URL information for the dashboard. This should be set via the url setter,
   * but read through this getter, as it brings in some extra information.
   */
  get urlInfo(): DashboardURLInfo {
    return this._urlInfo;
  }

  /**
   * A signal emitted when the url changes.
   */
  get urlInfoChanged(): ISignal<this, URLInput.IChangedArgs> {
    return this._urlChanged;
  }

  /**
   * Dispose of the resources held by the dashboard.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._poll.dispose();
    super.dispose();
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the main area widget's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: KeyboardEvent): void {
    switch (event.type) {
      case 'keydown':
        switch (event.keyCode) {
          case 13: // Enter
            event.stopPropagation();
            event.preventDefault();
            this.url = this._input.value;
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  }

  /**
   * Handle `after-attach` messages for the widget.
   */
  protected onAfterAttach(): void {
    this._input.addEventListener('keydown', this, true);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(): void {
    this._input.removeEventListener('keydown', this, true);
  }

  /**
   * Periodically poll for valid url.
   */
  private _startUrlCheckTimer(): void {
    this._poll = new Poll({
      factory: async () => {
        const urlInfo = this._urlInfo;
        // Don't bother checking if there is no url.
        if (!urlInfo.url) {
          return;
        }
        const result = await Private.testDaskDashboard(
          urlInfo.url,
          this._serverSettings
        );
        // Show an error if the connection died.
        if (!result.isActive && urlInfo.isActive) {
          console.warn(
            `The connection to dask dashboard ${urlInfo.url} has been lost`
          );
        }
        if (!JSONExt.deepEqual(result, urlInfo)) {
          this._urlInfo = result;
          this._urlChanged.emit({
            oldValue: urlInfo,
            newValue: result
          });
        }
      },
      frequency: { interval: 4 * 1000, backoff: true, max: 60 * 1000 },
      standby: 'when-hidden'
    });
  }

  private _urlChanged = new Signal<this, URLInput.IChangedArgs>(this);
  private _urlInfo: DashboardURLInfo = { isActive: false, url: '', plots: {} };
  private _input: HTMLInputElement;
  private _poll: Poll;
  private _serverSettings: ServerConnection.ISettings;
}

/**
 * A namespace for URLInput statics.
 */
export namespace URLInput {
  /**
   * Changed args for the url.
   */
  export interface IChangedArgs {
    /**
     * The old url info.
     */
    oldValue: DashboardURLInfo;

    /**
     * The new url info.
     */
    newValue: DashboardURLInfo;
  }
}

/**
 * A namespace for DaskDashboardLauncher statics.
 */
export namespace DaskDashboardLauncher {
  /**
   * Options for the constructor.
   */
  export interface IOptions {
    /**
     * A function that attempts to find a link to
     * a dask bokeh server in the current application
     * context.
     */
    linkFinder?: () => Promise<string>;

    /**
     * A callback to launch a dashboard item.
     */
    launchItem: (item: IDashboardItem) => void;

    /**
     * A list of items for the launcher.
     */
    items?: IDashboardItem[];
  }

  export const DEFAULT_ITEMS = [
    { route: 'individual-task-stream', label: 'Task Stream' },
    { route: 'individual-progress', label: 'Progress' },
    { route: 'individual-workers', label: 'Workers' },
    { route: 'individual-nbytes', label: 'Memory (worker)' },
    { route: 'individual-cpu', label: 'CPU (workers)' },
    { route: 'statics/individual-cluster-map.html', label: 'Cluster Map' },
    { route: 'individual-graph', label: 'Graph' },
    { route: 'individual-nprocessing', label: 'Processing Tasks' },
    {
      route: 'individual-compute-time-per-key',
      label: 'Compute Time (operation)'
    },
    { route: 'individual-memory-by-key', label: 'Memory (operation)' },
    { route: 'individual-profile', label: 'Profile' },
    { route: 'individual-profile-server', label: 'Profile Server' },
    { route: 'individual-bandwidth-workers', label: 'Bandwidth (workers)' },
    { route: 'individual-bandwidth-types', label: 'Bandwidth (type)' },
    {
      route: 'individual-aggregate-time-per-action',
      label: 'Compute/Transfer'
    },
    { route: 'individual-gpu-memory', label: 'GPU Memory' },
    { route: 'individual-gpu-utilization', label: 'GPU Utilization' }
  ];
}

/**
 * A React component for a launcher button listing.
 */
function DashboardListing(props: IDashboardListingProps) {
  let listing = props.items.map(item => {
    return (
      <li className="dask-DashboardListing-item" key={item.route}>
        <button
          className="jp-mod-styled jp-mod-accept"
          value={item.label}
          disabled={!props.isEnabled}
          onClick={() => props.launchItem(item)}
        >
          {item.label}
        </button>
      </li>
    );
  });

  // Return the JSX component.
  return (
    <div>
      <ul className="dask-DashboardListing-list">{listing}</ul>
    </div>
  );
}

/**
 * Props for the dashboard listing component.
 */
export interface IDashboardListingProps {
  /**
   * A list of dashboard items to render.
   */
  items: IDashboardItem[];

  /**
   * A callback to launch a dashboard item.
   */
  launchItem: (item: IDashboardItem) => void;

  /**
   * Whether the items should be enabled.
   */
  isEnabled: boolean;
}

/**
 * An interface dashboard launcher item.
 */
export interface IDashboardItem extends JSONObject {
  /**
   * The route to add the the base url.
   */
  route: string;

  /**
   * The display label for the item.
   */
  label: string;
}

/**
 * A namespace for private functionality.
 */
namespace Private {
  /**
   * Optionally remove a `status` route from a dashboard url.
   */
  export function normalizeDashboardUrl(url: string, baseUrl = ''): string {
    if (isLocal(url)) {
      if (!baseUrl) {
        baseUrl = PageConfig.getBaseUrl();
      }
      // If the path-portion of the baseUrl has been included,
      // strip that off.
      const tmp = new URL(baseUrl);
      if (url.startsWith(tmp.pathname)) {
        url = url.slice(tmp.pathname.length);
      }
      // Fully qualify the local URL to remove any relative-path confusion.
      url = baseUrl + url;
    }
    // If 'status' has been included at the end, strip it.
    if (url.endsWith('status')) {
      url = url.slice(0, -'status'.length);
    } else if (url.endsWith('status/')) {
      url = url.slice(0, -'status/'.length);
    }
    return url;
  }

  /**
   * Return the json result of /individual-plots.json
   */
  export function getDashboardPlots(info: DashboardURLInfo): IDashboardItem[] {
    const plots: IDashboardItem[] = [];
    for (let key in info.plots) {
      const label = key.replace('Individual ', '');
      const route = String(info.plots[key]);
      const plot = { route: route, label: label, key: label };
      plots.push(plot);
    }
    return plots;
  }

  /**
   * Test whether a given URL hosts a dask dashboard.
   */
  export async function testDaskDashboard(
    url: string,
    settings: ServerConnection.ISettings
  ): Promise<DashboardURLInfo> {
    url = normalizeDashboardUrl(url, settings.baseUrl);

    // If this is a url that we are proxying under the notebook server,
    // check for the individual charts directly.
    if (url.indexOf(settings.baseUrl) === 0) {
      return ServerConnection.makeRequest(
        URLExt.join(url, 'individual-plots.json'),
        {},
        settings
      ).then(async response => {
        if (response.status === 200) {
          const plots = (await response.json()) as { [plot: string]: string };
          return {
            url,
            isActive: true,
            plots
          };
        } else {
          return {
            url,
            isActive: false,
            plots: {}
          };
        }
      });
    }

    const response = await ServerConnection.makeRequest(
      URLExt.join(
        settings.baseUrl,
        'dask',
        'dashboard-check',
        encodeURIComponent(url)
      ),
      {},
      settings
    );
    const info = (await response.json()) as DashboardURLInfo;
    return info;
  }

  export function createInactivePanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'dask-DaskDashboard-inactive';
    return panel;
  }

  /**
   * Test whether the url is a local url.
   *
   * #### Notes
   * This function returns `false` for any fully qualified url, including
   * `data:`, `file:`, and `//` protocol URLs.
   */
  export function isLocal(url: string): boolean {
    const { protocol } = URLExt.parse(url);

    return (
      url.toLowerCase().indexOf(protocol!) !== 0 && url.indexOf('//') !== 0
    );
  }
}
