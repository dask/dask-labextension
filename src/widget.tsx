import { showErrorMessage } from '@jupyterlab/apputils';

import { URLExt, IChangedArgs } from '@jupyterlab/coreutils';

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
    this._input = new URLInput();
    layout.addWidget(this._input);
    layout.addWidget(this._listing);
    this.addClass('dask-DaskDashboardLauncher');
    this._commands = options.commands;
    this._items = options.items || DaskDashboardLauncher.DEFAULT_ITEMS;
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
      <DashboardListing commands={this._commands} items={this._items} />,
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
  constructor() {
    super();
    this.addClass('dask-URLInput');
    const wrapper = document.createElement('div');
    wrapper.className = 'dask-URLInput-wrapper';
    this._input = document.createElement('input');
    this._input.placeholder = 'DASK DASHBOARD URL';
    this.node.appendChild(wrapper);
    wrapper.appendChild(this._input);
  }

  /**
   * The underlying input value.
   */
  get input(): HTMLInputElement {
    return this._input;
  }

  /**
   * The base url for the dask webserver.
   */
  get url(): string {
    return this._url;
  }
  set url(newValue: string) {
    const oldValue = this._url;
    if (newValue === oldValue) {
      return;
    }
    this._url = newValue;
    this._input.value = newValue;
    this._urlChanged.emit({ name: 'url', oldValue, newValue });
    this.update();
  }

  /**
   * A signal emitted when the url changes.
   */
  get urlChanged(): ISignal<this, IChangedArgs<string>> {
    return this._urlChanged;
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
            const value = this._input.value;
            this._testDaskDashboard(value).then(result => {
              if (result) {
                this.url = value;
              } else {
                showErrorMessage(
                  'Invalid URL',
                  Error(`${value} does not appear to be a valid Dask dashboard`)
                );
              }
            });

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
   * Test whether a given URL hosts a dask dashboard.
   */
  private _testDaskDashboard(url: string): Promise<boolean> {
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
      let logoUrl = URLExt.join(url, 'statics/dask_horizontal.svg');
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

  private _urlChanged = new Signal<this, IChangedArgs<string>>(this);
  private _url: string;
  private _input: HTMLInputElement;
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
     * A list of items for the launcher.
     */
    items?: IItem[];
  }

  export const DEFAULT_ITEMS = [
    { route: 'solo-graph', label: 'Graph' },
    { route: 'solo-load', label: 'Load' },
    { route: 'solo-profile', label: 'Profile' },
    { route: 'solo-progress', label: 'Progress' },
    { route: 'solo-task-stream', label: 'Task Stream' }
  ];
}
