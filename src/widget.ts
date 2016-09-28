import {
  Widget, ResizeMessage
} from 'phosphor/lib/ui/widget';

import {
  Message
} from 'phosphor/lib/core/messaging';


/**
 * A Distributed UI element (generally a Bokeh plot) which wraps a phosphor widget.
 */
export
class DistributedUIElement extends Widget {
  /**
   * Create a new DistributedUIElement.
   */
  constructor(script: any) {
    super();

    // store bokeh model id as private attr for access in onResize eventing
    this._bokeh_id = script["data-bokeh-model-id"]

    let tag = document.createElement('script')
    tag.src = script.src
    tag.id = script.bokeh_id
    tag.setAttribute('data-bokeh-model-id', script['data-bokeh-model-id'])
    tag.setAttribute('data-bokeh-doc-id', script['data-bokeh-doc-id'])
    tag.onload = (event: Event) => {
      let that = this
      setTimeout(function() {
        // wait until bokehjs is loaded and the plot is rendered and added to the index
        // there's almost definitely a more elegant way to do this
        that._plot_ref = Bokeh.index[that._bokeh_id].model;
      }, 1000)
    };

    // wrap bokeh elements in div to apply css selector
    let div = document.createElement('div')
    div.classList.add('bk-root')
    // could use some padding, but it interferes w/ the resizing rn
    // div.style['margin'] = '10px 5px 5px'
    div.appendChild(tag)

    this.id = script.id
    this.title.label = script.text
    this.title.closable = true
    this.node.appendChild(div)
  }

  /**
   * A message handler invoked on a `'resize'` message.
   */
  protected onResize(msg: ResizeMessage) {
    if (this._plot_ref) {
      let width: Number = msg.width;
      let height: Number = msg.height;
      if (width===-1) {
        width = null;
      }
      if (height===-1) {
        height = null;
      }
      this._plot_ref.document.resize(width, height)
    }
  }

  private _bokeh_id: string = "";
  private _plot_ref: any = null
}
