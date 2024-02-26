import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const MOTIF_HINTS_TITLE_BAR = "2, 0, 1, 0, 0";
const MOTIF_HINTS_NO_TITLE_BAR = "2, 0, 0, 0, 0";

export default class NoTitleBarWhenMaximizedExtension extends Extension {
  enable() {
    this._xWindows = new WeakMap();

    this._createdConnection = global.display.connect(
      "window-created",
      (_, window) => this._sync(window)
    );

    this._changedConnection = global.window_manager.connect(
      "size-changed",
      (_, actor) => {
        this._sync(actor.get_meta_window());
      }
    );

    this._forEachWindow((window) => {
      this._sync(window);
    });
  }

  disable() {
    global.display.disconnect(this._createdConnection);
    global.window_manager.disconnect(this._changedConnection);

    this._forEachWindow((window) => {
      this._restore(window);
    });

    // Reset all state
    this._xWindows = null;
    this._createdConnection = null;
    this._changedConnection = null;
  }

  _forEachWindow(callback) {
    for (const actor of global.get_window_actors()) {
      try {
        callback(actor.get_meta_window());
      } catch (error) {
        logError(error);
      }
    }
  }

  _sync(window) {
    if (!window) {
      console.warn("possible bug: attempted to sync without window");
      return;
    }

    const xWindow = this._xWindow(window);

    if (!xWindow) {
      return;
    }

    if (window.get_maximized()) {
      xWindow.setMotifHints(MOTIF_HINTS_NO_TITLE_BAR);
    } else {
      xWindow.setMotifHints(MOTIF_HINTS_TITLE_BAR);
    }
  }

  _restore(window) {
    if (!window) {
      console.warn("possible bug: attempted to restore without window");
      return;
    }

    const xWindow = this._xWindow(window, false);

    if (!xWindow) {
      return;
    }

    // This is the original state of the tracked window
    xWindow.setMotifHints(MOTIF_HINTS_TITLE_BAR);
  }

  _xWindow(window, buildMissing = true) {
    let xWindow = this._xWindows.get(window);

    if (xWindow === undefined && buildMissing) {
      xWindow = this._buildXWindow(window);
      this._xWindows.set(window, xWindow);
    }

    return xWindow;
  }

  _buildXWindow(window) {
    const xWindow = XWindow.forWindow(window);

    if (
      !xWindow ||
      // Only track windows which have a title bar
      xWindow.motifHints !== MOTIF_HINTS_TITLE_BAR
    ) {
      return null;
    }

    return xWindow;
  }
}

class XWindow {
  static forWindow(window) {
    if (
      window.get_client_type() !== Meta.WindowClientType.X11 ||
      window.get_window_type() !== Meta.WindowType.NORMAL
    ) {
      return null;
    }

    const xId = findXIdForWindow(window);
    return xId && new XWindow(xId);
  }

  constructor(xId) {
    this.xId = xId;
    this._motifHints = getMotifHints(xId) || MOTIF_HINTS_TITLE_BAR;
  }

  get motifHints() {
    return this._motifHints;
  }

  setMotifHints(motifHints) {
    if (this._motifHints !== motifHints) {
      setMotifHints(this.xId, motifHints);
    }

    this._motifHints = motifHints;
  }
}

const XID_REGEXP = /0x[0-9a-f]+/;

function findXIdForWindow(window) {
  const description = window.get_description();
  const match = description.match(XID_REGEXP);
  return match && match[0];
}

const MOTIF_HINTS_PROP = "_MOTIF_WM_HINTS";
const MOTIF_HINTS_FORMAT_ARGS = ["-f", MOTIF_HINTS_PROP, "32c"];

function getMotifHints(xId) {
  const command = [
    "xprop",
    "-id",
    xId,
    ...MOTIF_HINTS_FORMAT_ARGS,
    "-notype",
    MOTIF_HINTS_PROP,
  ];

  const [isOk, stdout, , exitCode] = GLib.spawn_sync(
    null, // inherit cwd
    command, // command to run
    null, // inherit env
    GLib.SpawnFlags.SEARCH_PATH, // search the path
    null // no setup func before `exec`
  );

  if (!isOk || exitCode !== 0) {
    return null;
  }

  const textDecoder = new TextDecoder();
  const output = textDecoder.decode(stdout);

  if (!output) {
    return null;
  }

  const [name, motifHints] = output.split(" = ", 2);

  // make sure that we got the correct property
  if (name !== MOTIF_HINTS_PROP) {
    return null;
  }

  return motifHints.trim();
}

function setMotifHints(xId, motifHints) {
  const command = [
    "xprop",
    "-id",
    xId,
    ...MOTIF_HINTS_FORMAT_ARGS,
    "-set",
    MOTIF_HINTS_PROP,
    motifHints,
  ];

  GLib.spawn_async(
    null, // inherit cwd
    command, // command to run
    null, // inherit env
    GLib.SpawnFlags.SEARCH_PATH, // search the path
    null // no setup func before `exec`
  );
}
