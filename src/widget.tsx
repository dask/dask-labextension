import { ToolbarButton } from '@jupyterlab/apputils';

import { URLExt } from '@jupyterlab/coreutils';

import { CommandRegistry } from '@phosphor/commands';

import { JSONObject } from '@phosphor/coreutils';

import { Message } from '@phosphor/messaging';

import { ISignal, Signal } from '@phosphor/signaling';

import { Widget, PanelLayout } from '@phosphor/widgets';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

/**
 * A widget for hosting a notebook table-of-contents.
 */
export class DaskDashboardLauncher extends Widget {
  /**
   * Create a new table of contents.
   */
  constructor(options: DaskDashboardLauncher.IOptions) {
    super();
    let layout = (this.layout = new PanelLayout());
    this._listing = new Widget();
    this._input = new URLInput(options.linkFinder);
    layout.addWidget(this._input);
    layout.addWidget(this._listing);
    this.addClass('dask-DaskDashboardLauncher');
    this._commands = options.commands;
    this._items = options.items || DaskDashboardLauncher.DEFAULT_ITEMS;
    this._input.urlChanged.connect(
      this.update,
      this
    );
  }

  /**
   * The list of dashboard items which can be launched.
   */
  get items(): DaskDashboardLauncher.IItem[] {
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
  protected onUpdateRequest(msg: Message): void {
    // Don't bother if the TOC is not visible
    if (!this.isVisible) {
      return;
    }

    ReactDOM.render(
      <DashboardListing
        isEnabled={this.input.isValid}
        commands={this._commands}
        items={this._items}
      />,
      this._listing.node
    );
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(msg: Message): void {
    this.update();
  }

  private _listing: Widget;
  private _input: URLInput;
  private _commands: CommandRegistry;
  private _items: DaskDashboardLauncher.IItem[];
}

/**
 * A widget for hosting a url input element.
 */
export class URLInput extends Widget {
  /**
   * Construct a new input element.
   */
  constructor(linkFinder?: () => Promise<string>) {
    super();
    this.addClass('dask-URLInput');
    const layout = (this.layout = new PanelLayout());
    const wrapper = new Widget();
    wrapper.addClass('dask-URLInput-wrapper');
    this._input = document.createElement('input');
    this._input.placeholder = 'DASK DASHBOARD URL';
    wrapper.node.appendChild(this._input);
    layout.addWidget(wrapper);

    if (linkFinder) {
      const findButton = new ToolbarButton({
        iconClassName: 'dask-SearchLogo jp-Icon jp-Icon-16',
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
  get url(): string {
    return this._url;
  }
  set url(newValue: string) {
    this._input.value = newValue;
    const oldValue = this._url;
    if (newValue === oldValue) {
      return;
    }
    Private.testDaskDashboard(newValue).then(result => {
      this._url = newValue;
      this._isValid = result;
      this._urlChanged.emit({ isValid: result, oldValue, newValue });
      this._input.blur();
      this.update();
      if (!result) {
        console.warn(
          `${newValue} does not appear to host a valid Dask dashboard`
        );
      }
    });
  }

  /**
   * Whether the current url is pointing to a valid dask dashboard.
   */
  get isValid(): boolean {
    return this._isValid;
  }

  /**
   * A signal emitted when the url changes.
   */
  get urlChanged(): ISignal<this, URLInput.IChangedArgs> {
    return this._urlChanged;
  }

  /**
   * Dispose of the resources held by the dashboard.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    window.clearInterval(this._timer);
  }

  /**
   * Whether the dashboard has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
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
  protected onAfterAttach(msg: Message): void {
    this._input.addEventListener('keydown', this, true);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    this._input.removeEventListener('keydown', this, true);
  }

  /**
   * Periodically poll for valid url.
   */
  private _startUrlCheckTimer(): void {
    this._timer = window.setInterval(() => {
      const url = this._url;
      // Don't bother checking if there is no url.
      if (!url) {
        return;
      }
      Private.testDaskDashboard(url).then(result => {
        // No change.
        if (result === this._isValid) {
          return;
        }
        // Show an error if the connection died.
        if (!result && this._isValid) {
          console.warn(`The connection to dask dashboard ${url} has been lost`);
        }
        // Connection died or started
        if (result !== this._isValid) {
          this._isValid = result;
          this._urlChanged.emit({
            oldValue: url,
            newValue: url,
            isValid: result
          });
        }
      });
    }, 2000); // Every two seconds.
  }

  private _urlChanged = new Signal<this, URLInput.IChangedArgs>(this);
  private _url: string;
  private _isValid: boolean;
  private _input: HTMLInputElement;
  private _timer: number;
  private _isDisposed: boolean;
}

/**
 * A React component for a launcher button listing.
 */
export class DashboardListing extends React.Component<
  IDashboardListingProps,
  {}
> {
  /**
   * Render the TOCTree.
   */
  render() {
    let listing = this.props.items.map(item => {
      const handler = () => {
        this.props.commands.execute('dask:launch-dashboard', item);
      };
      return (
        <li className="dask-DashboardListing-item" key={item.route}>
          <button
            className="jp-mod-styled jp-mod-accept"
            value={item.label}
            disabled={!this.props.isEnabled}
            onClick={handler}
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
     * The old url.
     */
    oldValue: string;

    /**
     * The new url.
     */
    newValue: string;

    /**
     * Whether the URL is pointing at a valid dask webserver.
     */
    isValid: boolean;
  }
}

/**
 * Props for the TOCTree component.
 */
export interface IDashboardListingProps extends React.Props<DashboardListing> {
  /**
   * A command registry.
   */
  commands: CommandRegistry;

  /**
   * A list of dashboard items to render.
   */
  items: DaskDashboardLauncher.IItem[];

  /**
   * Whether the items should be enabled.
   */
  isEnabled: boolean;
}
/**
 * A namespace for DaskDashboardLauncher statics.
 */
export namespace DaskDashboardLauncher {
  /**
   * An interface dashboard launcher item.
   */
  export interface IItem extends JSONObject {
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

    /**
     * A list of items for the launcher.
     */
    items?: IItem[];
  }

  export const DEFAULT_ITEMS = [
    { route: 'individual-graph', label: 'Graph' },
    { route: 'individual-nbytes', label: 'Memory Use' },
    { route: 'individual-nprocessing', label: 'Processing Tasks' },
    { route: 'individual-profile', label: 'Profile' },
    { route: 'individual-profile-server', label: 'Profile Server' },
    { route: 'individual-progress', label: 'Progress' },
    { route: 'individual-task-stream', label: 'Task Stream' },
    { route: 'individual-workers', label: 'Workers' }
  ];
}

/**
 * A namespace for private functionality.
 */
namespace Private {
  /**
   * Test whether a given URL hosts a dask dashboard.
   */
  export function testDaskDashboard(url: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      // Hack Alert! We would like to test whether a given URL is actually
      // a dask dashboard, since we will be iframe-ing it sight-unseen.
      // However, CORS policies prevent us from doing a normal fetch
      // to an arbitrary URL. We *can*, however, request an image from
      // an arbitrary location. So let's request the dask logo from the
      // bokeh server statics directory and check whether that was successful.
      //
      // If the logo ever moves or changes names, or if there is a different
      // server with an identical file path, then this will fail.
      let logoUrl = URLExt.join(url, 'statics/images/dask-logo.svg');
      // Bust caching for src attr
      // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Using_XMLHttpRequest#Bypassing_the_cache
      logoUrl += (/\?/.test(logoUrl) ? '&' : '?') + new Date().getTime();

      let img = document.createElement('img');
      img.onload = () => {
        resolve(true);
      };
      img.onerror = () => {
        resolve(false);
      };
      img.src = logoUrl;
    });
  }
}
