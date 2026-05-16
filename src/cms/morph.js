import HyperMorph from 'hyper-morph'
import { widgetHandles } from './widget-handles.js'

/**
 * Morphs the contents of `formRoot` to match `newFragment`, preserving
 * focus, caret, and live widget instances where possible.
 *
 * The morph wraps HyperMorph with:
 *   morphStyle:         'innerHTML' — children of formRoot map to children
 *                       of newFragment
 *   ignoreActiveValue:  true — never overwrite a value the user is mid-typing
 *   restoreFocus:       true — restore focus by id after the morph
 *   beforeNodeRemoved:  looks up the removed node in the shared
 *                       widgetHandles WeakMap and runs destroy() if present,
 *                       then invokes the optional caller hook
 *
 * Note: hyper-morph moves persistent / hyper-matched nodes to a "pantry"
 * instead of calling beforeNodeRemoved. A field row that survives the
 * structural change does NOT fire destroy — which is correct, the widget
 * instance persists with it.
 */
export function morphForm(formRoot, newFragment, { onWidgetRemoved } = {}) {
  HyperMorph.morph(formRoot, newFragment, {
    morphStyle: 'innerHTML',
    ignoreActiveValue: true,
    restoreFocus: true,
    callbacks: {
      beforeNodeRemoved(node) {
        const handle = widgetHandles.get(node)
        if (handle?.destroy) handle.destroy()
        onWidgetRemoved?.(node)
      },
    },
  })
}
